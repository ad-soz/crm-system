import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_PENDING_PASSWORD_KEY } from '../decorators/allow-pending-password.decorator';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  handleRequest<TUser = any>(err: any, user: any, info: any, context: ExecutionContext): TUser {
    if (err || !user) throw err || new UnauthorizedException();

    if (user.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          code: PASSWORD_CHANGE_REQUIRED,
          message: 'Choose a new password to continue.',
        });
      }
    }
    return user;
  }
}
