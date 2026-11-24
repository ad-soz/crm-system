import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, passwordVersion } from './strategies/jwt.strategy';
import { hashPassword } from './passwords';
import { toUserView, withProfile } from '../users/user-view';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    let user;
    try {
      user = await this.validateUser(dto.email, dto.password);
    } catch (err) {
      // Only the address that was tried is recorded, never the password.
      if (err instanceof UnauthorizedException && (await this.audit.failedSignInAllowed())) {
        await this.audit.event('sign_in_failed', { entity: 'session', detail: `Tried: ${String(dto.email).trim().slice(0, 200)}` });
      }
      throw err;
    }
    await this.audit.event('sign_in', { actorId: user.id, entity: 'session', recordId: user.id });
    return { accessToken: this.issueToken(user), user: toUserView(user) };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: withProfile });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: withProfile });
    if (!user) throw new UnauthorizedException();
    return toUserView(user);
  }

  /**
   * Replace the user's password. Ends their other sessions, and returns a new
   * token so the current one keeps working.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Your current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('Choose a password that is different from your current one');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
      include: withProfile,
    });
    return { accessToken: this.issueToken(updated), user: toUserView(updated) };
  }

  private issueToken(user: User): string {
    const payload: JwtPayload = { sub: user.id, email: user.email, pwd: passwordVersion(user) };
    return this.jwtService.sign(payload);
  }
}
