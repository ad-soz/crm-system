import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  catalog,
  coversAll,
  effectivePermissions,
  normalizePermissions,
} from '../permissions/permissions';
import { CreateRoleProfileDto, UpdateRoleProfileDto } from './dto/role-profile.dto';

/** Who is making the change: their id, profile, and current permissions. */
export interface Actor {
  id: string;
  roleProfile: { id: string };
  permissions: string[];
}

const KNOWN = new Set(ALL_PERMISSIONS);

@Injectable()
export class RoleProfilesService {
  constructor(private prisma: PrismaService) {}

  catalog() {
    return catalog();
  }

  async list() {
    const profiles = await this.prisma.roleProfile.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return profiles.map((p) => this.view(p, p._count.users));
  }

  async create(dto: CreateRoleProfileDto, actor: Actor) {
    const name = await this.validName(dto.name);
    const permissions = this.validPermissions(dto.permissions);
    this.assertCanGrant(actor, permissions);

    const profile = await this.prisma.roleProfile.create({
      data: { name, description: dto.description?.trim() || null, permissions: JSON.stringify(permissions) },
    });
    return this.view(profile, 0);
  }

  async update(id: string, dto: UpdateRoleProfileDto, actor: Actor) {
    const profile = await this.get(id);
    if (profile.isSystem) throw new ForbiddenException(`The ${profile.name} profile can't be changed`);
    if (actor.roleProfile.id === id) {
      throw new ForbiddenException(
        "You can't change the profile you're using. Ask someone else who can manage role profiles.",
      );
    }

    const current = effectivePermissions(profile);
    const next = dto.permissions !== undefined ? this.validPermissions(dto.permissions) : current;
    // Needed for both: removing access you don't have, or adding access you don't have.
    this.assertCanGrant(actor, [...new Set([...current, ...next])]);

    const name = dto.name !== undefined ? await this.validName(dto.name, id) : profile.name;
    const updated = await this.prisma.roleProfile.update({
      where: { id },
      data: {
        name,
        description: dto.description !== undefined ? dto.description.trim() || null : profile.description,
        permissions: JSON.stringify(next),
      },
      include: { _count: { select: { users: true } } },
    });
    return this.view(updated, updated._count.users);
  }

  async remove(id: string) {
    const profile = await this.get(id);
    if (profile.isSystem) throw new ForbiddenException(`The ${profile.name} profile can't be deleted`);
    const users = await this.prisma.user.count({ where: { roleProfileId: id } });
    if (users > 0) {
      throw new ConflictException(
        `${users} ${users === 1 ? 'person uses' : 'people use'} this profile. Move them to another profile first.`,
      );
    }
    await this.prisma.roleProfile.delete({ where: { id } });
    return { success: true };
  }

  private async get(id: string) {
    const profile = await this.prisma.roleProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Role profile not found');
    return profile;
  }

  private async validName(raw: string, excludeId?: string) {
    const name = raw.trim();
    if (!name) throw new BadRequestException('Name is required');
    // SQLite's unique index is case-sensitive; treat "Sales" and "sales" as the same.
    const clash = (await this.prisma.roleProfile.findMany({ select: { id: true, name: true } })).find(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId,
    );
    if (clash) throw new ConflictException(`A profile called "${clash.name}" already exists`);
    return name;
  }

  private validPermissions(input: string[]) {
    const unknown = input.filter((p) => !KNOWN.has(p));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    return normalizePermissions(input);
  }

  /** You can't create or change a profile to include permissions you don't hold. */
  private assertCanGrant(actor: Actor, permissions: string[]) {
    if (!coversAll(actor.permissions, permissions)) {
      const missing = permissions.filter((p) => !actor.permissions.includes(p));
      throw new ForbiddenException(
        `You can only work with permissions you have yourself. Missing: ${missing.join(', ')}`,
      );
    }
  }

  private view(profile: RoleProfile, userCount: number) {
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      isSystem: profile.isSystem,
      permissions: effectivePermissions(profile),
      userCount,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
