// Values that have appeared in this project's code or docs. A token signed
// with any of them could be forged by anyone who has seen the source.
const KNOWN_PLACEHOLDERS = new Set([
  'crm-super-secret-jwt-key-change-in-production',
  'fallback-secret',
  'changeme',
  'secret',
]);

const MIN_LENGTH = 32;

/**
 * Return the JWT signing secret, or stop the server with a clear message.
 * There is deliberately no fallback: a missing secret must not silently
 * become a guessable one.
 */
export function requireJwtSecret(value: string | undefined): string {
  if (!value) {
    throw new Error(
      'JWT_SECRET is not set. Put it in the CRM secrets file (see README, "Secrets and data").',
    );
  }
  if (KNOWN_PLACEHOLDERS.has(value) || value.length < MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET is a placeholder or too short. Use a random value of at least ${MIN_LENGTH} characters.`,
    );
  }
  return value;
}
