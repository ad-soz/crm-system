import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords';
import { ADMINISTRATOR_PROFILE_ID, coversAll, effectivePermissions } from '../permissions/permissions';
import type { Actor } from '../role-profiles/role-profiles.service';
import { InviteUserDto } from './dto/invite-user.dto';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  mustChangePassword: true,
  roleProfile: { select: { id: true, name: true, isSystem: true } },
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' }, select: userSelect }),
      this.prisma.user.count(),
    ]);
    return { data: users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Create an account with a one-time temporary password. The password is
   * returned once so the admin can pass it on; it is never stored in plain text.
   */
  async invite(dto: InviteUserDto, actor: Actor) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Someone with that email already has an account');
    }
    const profile = await this.getProfile(dto.roleProfileId);
    this.assertCanManage(actor, effectivePermissions(profile), 'give someone that profile');

    const temporaryPassword = generateTemporaryPassword();
    const user = await this.prisma.user.create({
      data: {
        email,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        roleProfileId: profile.id,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
      select: userSelect,
    });
    return { user, temporaryPassword };
  }

  async assignProfile(id: string, roleProfileId: string, actor: Actor) {
    if (id === actor.id) {
      throw new BadRequestException("You can't change your own role profile. Ask someone else who can manage users.");
    }
    const target = await this.getUser(id);
    const profile = await this.getProfile(roleProfileId);
    this.assertCanManage(actor, effectivePermissions(target.roleProfile), 'change this person’s access');
    this.assertCanManage(actor, effectivePermissions(profile), 'give someone that profile');

    if (target.roleProfileId === ADMINISTRATOR_PROFILE_ID && roleProfileId !== ADMINISTRATOR_PROFILE_ID) {
      const admins = await this.prisma.user.count({ where: { roleProfileId: ADMINISTRATOR_PROFILE_ID } });
      if (admins <= 1) {
        throw new BadRequestException('There must always be at least one Administrator.');
      }
    }
    return this.prisma.user.update({ where: { id }, data: { roleProfileId }, select: userSelect });
  }

  /** Give a user a new temporary password and sign them out everywhere. */
  async resetPassword(id: string, actor: Actor) {
    if (id === actor.id) {
      throw new BadRequestException('Change your own password from your Account page');
    }
    const target = await this.getUser(id);
    this.assertCanManage(actor, effectivePermissions(target.roleProfile), 'reset this person’s password');

    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    return { temporaryPassword };
  }

  async update(id: string, data: { firstName?: string; lastName?: string; email?: string }, actor: Actor) {
    const user = await this.getUser(id);
    if (id !== actor.id) {
      this.assertCanManage(actor, effectivePermissions(user.roleProfile), 'edit this person');
    }
    if (data.email && data.email !== user.email) {
      if (await this.prisma.user.findUnique({ where: { email: data.email } })) {
        throw new BadRequestException('Email already in use');
      }
    }
    return this.prisma.user.update({ where: { id }, data, select: userSelect });
  }

  /**
   * You can only manage people (or hand out profiles) whose access doesn't go
   * beyond your own. Without this, anyone who can manage users could make
   * themselves an Administrator by proxy.
   */
  private assertCanManage(actor: Actor, targetPermissions: string[], what: string) {
    if (!coversAll(actor.permissions, targetPermissions)) {
      throw new ForbiddenException(`You can't ${what}: it includes access you don't have yourself.`);
    }
  }

  private async getUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { roleProfile: true } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async getProfile(id: string) {
    const profile = await this.prisma.roleProfile.findUnique({ where: { id } });
    if (!profile) throw new BadRequestException('That role profile does not exist');
    return profile;
  }
}
