import { homedir } from 'os';
import { join } from 'path';

// Private, per-user folder for secrets and data. On Windows this is
// %LOCALAPPDATA%\CRM, which is not synced by OneDrive and is readable only by
// this user (plus SYSTEM and administrators). Override with CRM_DATA_DIR.
export function crmDataDir(): string {
  if (process.env.CRM_DATA_DIR) return process.env.CRM_DATA_DIR;
  const base = process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share');
  return join(base, 'CRM');
}

/** Secrets file (JWT_SECRET, SCHEMA_EDITING_ENABLED). Loaded before server/.env. */
export function crmEnvFile(): string {
  return process.env.CRM_ENV_FILE ?? join(crmDataDir(), 'crm.env');
}

/** Where generated temporary passwords are written for the person running the tool. */
export function signInDetailsFile(): string {
  return join(crmDataDir(), 'sign-in-details.txt');
}
