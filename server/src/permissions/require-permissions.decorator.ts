import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

export interface PermissionRequirement {
  allOf?: string[];
  anyOf?: string[];
}

/** The signed-in user must hold every one of these permissions. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, { allOf: permissions } satisfies PermissionRequirement);

/** The signed-in user must hold at least one of these permissions. */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, { anyOf: permissions } satisfies PermissionRequirement);
