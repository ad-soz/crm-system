// The full list of application permissions. This is the single source of
// truth: the server checks against it and the app's role profile editor is
// built from GET /role-profiles/catalog.

export const AREAS = ['people', 'companies', 'deals', 'contacts', 'tasks'] as const;
export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

export type Area = (typeof AREAS)[number];
export type Action = (typeof ACTIONS)[number];

export const ADMIN_PERMISSIONS = [
  { key: 'users.manage', label: 'Manage users', description: 'Invite people, reset passwords, and assign role profiles' },
  { key: 'profiles.manage', label: 'Manage role profiles', description: 'Create, edit, and delete role profiles' },
  { key: 'appearance.manage', label: 'Organisation appearance', description: 'Set the default theme for everyone' },
  { key: 'reference.manage', label: 'Manage reference data', description: 'Edit the lists behind fields like industry, deal stage, and priority' },
  { key: 'backups.manage', label: 'Manage backups', description: 'See the database backups and make one on demand' },
  { key: 'data.import', label: 'Import CSV', description: 'Import people from a CSV file' },
  { key: 'data.export', label: 'Export CSV', description: 'Export people to a CSV file' },
  { key: 'audit.view', label: 'View audit log', description: 'See who changed what, and when, on every record' },
  { key: 'datamodel.view', label: 'View data model', description: 'See the data model diagram' },
  { key: 'datamodel.edit', label: 'Edit data model', description: 'Change the database structure (only when schema editing is switched on)' },
] as const;

export const AREA_LABELS: Record<Area, string> = {
  people: 'People',
  companies: 'Companies',
  deals: 'Deals',
  contacts: 'Contacts',
  tasks: 'Tasks',
};

export const ALL_PERMISSIONS: string[] = [
  ...AREAS.flatMap((area) => ACTIONS.map((action) => `${area}.${action}`)),
  ...ADMIN_PERMISSIONS.map((p) => p.key),
];

const KNOWN = new Set(ALL_PERMISSIONS);

export const ADMINISTRATOR_PROFILE_ID = 'administrator';
export const SALES_REP_PROFILE_ID = 'sales-rep';

/** What sales reps could do before role profiles existed. */
export const SALES_REP_PERMISSIONS: string[] = [
  ...AREAS.flatMap((area) => ACTIONS.map((action) => `${area}.${action}`)),
  'data.import',
  'data.export',
  'datamodel.view',
];

// Everyone who is signed in can read the lists (forms need them); only
// reference.manage lets you change them.

/**
 * Clean up a permission list: drop unknown keys and duplicates, and add
 * "view" for any area where create, edit, or delete is granted (you can't
 * change what you can't see). Also "datamodel.view" when "datamodel.edit" is.
 */
export function normalizePermissions(input: unknown): string[] {
  const list = Array.isArray(input) ? input.filter((p): p is string => typeof p === 'string' && KNOWN.has(p)) : [];
  const set = new Set(list);
  for (const area of AREAS) {
    if (ACTIONS.some((a) => a !== 'view' && set.has(`${area}.${a}`))) set.add(`${area}.view`);
  }
  if (set.has('datamodel.edit')) set.add('datamodel.view');
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** Permissions stored as JSON text in the database. Unreadable means none. */
export function parseStoredPermissions(raw: string | null | undefined): string[] {
  try {
    return normalizePermissions(JSON.parse(raw ?? '[]'));
  } catch {
    return [];
  }
}

/** The Administrator profile always has every permission, including future ones. */
export function effectivePermissions(profile: { id: string; permissions: string } | null | undefined): string[] {
  if (!profile) return [];
  if (profile.id === ADMINISTRATOR_PROFILE_ID) return [...ALL_PERMISSIONS];
  return parseStoredPermissions(profile.permissions);
}

/** True if `held` includes every permission in `wanted`. Used to stop escalation. */
export function coversAll(held: string[], wanted: string[]): boolean {
  const set = new Set(held);
  return wanted.every((p) => set.has(p));
}

export function catalog() {
  return {
    areas: AREAS.map((area) => ({
      key: area,
      label: AREA_LABELS[area],
      permissions: ACTIONS.map((action) => ({ key: `${area}.${action}`, action })),
    })),
    admin: ADMIN_PERMISSIONS.map((p) => ({ ...p })),
  };
}
