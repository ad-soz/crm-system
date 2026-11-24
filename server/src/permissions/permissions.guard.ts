import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PermissionRequirement } from './require-permissions.decorator';

/**
 * Checks @RequirePermissions / @RequireAnyPermission against the signed-in
 * user's permissions (loaded fresh from their role profile on every request
 * by JwtStrategy). Use after JwtAuthGuard. Routes without the decorator only
 * need the user to be signed in.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;

    const { user } = context.switchToHttp().getRequest();
    const held = new Set<string>(user?.permissions ?? []);
    const allOk = (requirement.allOf ?? []).every((p) => held.has(p));
    const anyOk = !requirement.anyOf || requirement.anyOf.some((p) => held.has(p));
    if (allOk && anyOk) return true;

    throw new ForbiddenException("You don't have permission to do that.");
  }
}
