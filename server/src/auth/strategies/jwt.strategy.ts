import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { requireJwtSecret } from '../jwt-secret';
import { toUserView, withProfile } from '../../users/user-view';

// Only identity goes in the token. Permissions are loaded from the user's
// role profile on every request, so changes take effect immediately.
export interface JwtPayload {
  sub: string;
  email: string;
  /** Password version the token was issued for (passwordChangedAt in ms, 0 if never changed). */
  pwd: number;
}

export const passwordVersion = (user: { passwordChangedAt: Date | null }) =>
  user.passwordChangedAt ? user.passwordChangedAt.getTime() : 0;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(config.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: withProfile });
    if (!user) throw new UnauthorizedException();

    // A password change or reset signs out every session issued before it.
    if (payload.pwd !== passwordVersion(user)) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    // Becomes req.user: profile, permissions, no password hash.
    return toUserView(user);
  }
}
