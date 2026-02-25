import { type User } from './user';

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'system',
  'deleted',
  'support',
  'moderator',
  'mod',
  'bot',
  'root',
  'sovran',
  'help',
  'info',
  'null',
  'undefined',
]);

export function isUsernameReserved(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

export function isAccountDeleted(user: User): boolean {
  return user.deletedAt !== null;
}

export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

/**
 * Returns anonymized field values for GDPR Art. 17 erasure.
 * username format: deleted_<id> (already lowercase, no normalization conflict)
 * passwordHash: '!' (invalid hash, verifyPassword will return false)
 */
export function anonymizeUser(userId: string): {
  username: string;
  displayName: string;
  passwordHash: string;
} {
  return {
    username: `deleted_${userId}`,
    displayName: 'Deleted User',
    passwordHash: '!',
  };
}
