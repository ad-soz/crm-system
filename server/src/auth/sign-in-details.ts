import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { signInDetailsFile } from '../config/local-paths';

/**
 * Write generated sign-in details to the private CRM folder (never to the
 * console or the synced project folder) and return the file path.
 */
export function writeSignInDetails(entries: { email: string; password: string }[]): string {
  const file = signInDetailsFile();
  mkdirSync(dirname(file), { recursive: true });
  const width = Math.max(...entries.map((e) => e.email.length)) + 3;
  const lines = [
    `CRM sign-in details, generated ${new Date().toLocaleString()}`,
    '',
    'These are temporary passwords. You will be asked to choose a new one when you sign in.',
    'Delete this file once everyone has signed in.',
    '',
    ...entries.map((e) => e.email.padEnd(width) + e.password),
    '',
  ];
  writeFileSync(file, lines.join('\r\n'), { encoding: 'utf-8', mode: 0o600 });
  return file;
}
