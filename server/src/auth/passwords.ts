import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 12;
// bcrypt only uses the first 72 bytes of a password.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72;

// No look-alike characters (0/O, 1/l/I) so it's easy to read and type.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random temporary password like "k7Qm-x9Tz-bR4w-Hn2e" (~92 bits). */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) group += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(group);
  }
  return groups.join('-');
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
