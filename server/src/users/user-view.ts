import { RoleProfile, User } from '@prisma/client';
import { effectivePermissions } from '../permissions/permissions';

export type UserWithProfile = User & { roleProfile: RoleProfile };

/** Prisma include that loads a user's role profile. */
export const withProfile = { roleProfile: true } as const;

/**
 * The shape returned to the app for the signed-in user: no password hash,
 * the profile's id and name, and the effective permission list.
 */
export function toUserView(user: UserWithProfile) {
  const { passwordHash, roleProfile, ...rest } = user;
  return {
    ...rest,
    roleProfile: { id: roleProfile.id, name: roleProfile.name, isSystem: roleProfile.isSystem },
    permissions: effectivePermissions(roleProfile),
  };
}

export type UserView = ReturnType<typeof toUserView>;
