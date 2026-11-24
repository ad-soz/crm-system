import type { LucideIcon } from 'lucide-react';
import { Database, DatabaseBackup, History, ListChecks, Palette, ShieldCheck, User, Users } from 'lucide-react';

/**
 * Every page under Settings, in one place. The menu is built from this, so
 * adding a section means adding one entry here and one route in App.tsx.
 * `permission` hides an item from people who could not use it anyway; the
 * server enforces the same rules on every request.
 */
export interface SettingsSection {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: 'You' | 'Organisation' | 'Advanced';
  permission?: string;
}

export const SETTINGS_GROUPS = ['You', 'Organisation', 'Advanced'] as const;

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { path: 'profile', label: 'My details', description: 'Your name, email and password', icon: User, group: 'You' },
  { path: 'appearance', label: 'Appearance', description: 'Colours, font and layout style', icon: Palette, group: 'You' },
  { path: 'users', label: 'Users', description: 'Invite people and reset passwords', icon: Users, group: 'Organisation', permission: 'users.manage' },
  { path: 'roles', label: 'Role profiles', description: 'What each kind of user can do', icon: ShieldCheck, group: 'Organisation', permission: 'profiles.manage' },
  { path: 'reference-data', label: 'Reference lists', description: 'Industries, stages, types, statuses, priorities', icon: ListChecks, group: 'Organisation', permission: 'reference.manage' },
  { path: 'backups', label: 'Backups', description: 'Saved copies of your data', icon: DatabaseBackup, group: 'Organisation', permission: 'backups.manage' },
  { path: 'audit', label: 'Audit log', description: 'Who changed what, and when', icon: History, group: 'Organisation', permission: 'audit.view' },
  { path: 'data-model', label: 'Data model', description: 'The structure of the database', icon: Database, group: 'Advanced', permission: 'datamodel.view' },
];

/** The sections a person may see, grouped, with empty groups left out. */
export function visibleSections(can: (permission: string) => boolean) {
  const allowed = SETTINGS_SECTIONS.filter((s) => !s.permission || can(s.permission));
  return SETTINGS_GROUPS.map((group) => ({ group, items: allowed.filter((s) => s.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}
