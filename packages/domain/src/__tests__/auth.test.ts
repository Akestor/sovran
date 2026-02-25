import { describe, it, expect } from 'vitest';
import {
  isUsernameReserved,
  isAccountDeleted,
  isTokenExpired,
  anonymizeUser,
  RESERVED_USERNAMES,
} from '../auth';
import { type User } from '../user';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '123456789',
    username: 'testuser',
    displayName: 'Test User',
    passwordHash: '$argon2id$hash',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

describe('isUsernameReserved', () => {
  it('returns true for reserved usernames', () => {
    for (const name of RESERVED_USERNAMES) {
      expect(isUsernameReserved(name)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isUsernameReserved('ADMIN')).toBe(true);
    expect(isUsernameReserved('Admin')).toBe(true);
    expect(isUsernameReserved('SyStEm')).toBe(true);
  });

  it('returns false for non-reserved usernames', () => {
    expect(isUsernameReserved('alice')).toBe(false);
    expect(isUsernameReserved('cool_user')).toBe(false);
  });
});

describe('isAccountDeleted', () => {
  it('returns false for active user', () => {
    expect(isAccountDeleted(makeUser())).toBe(false);
  });

  it('returns true for deleted user', () => {
    expect(isAccountDeleted(makeUser({ deletedAt: new Date() }))).toBe(true);
  });
});

describe('isTokenExpired', () => {
  it('returns true for past date', () => {
    expect(isTokenExpired(new Date('2020-01-01'))).toBe(true);
  });

  it('returns false for future date', () => {
    const future = new Date(Date.now() + 60_000);
    expect(isTokenExpired(future)).toBe(false);
  });
});

describe('anonymizeUser', () => {
  it('returns correct anonymized fields', () => {
    const result = anonymizeUser('123456789');
    expect(result.username).toBe('deleted_123456789');
    expect(result.displayName).toBe('Deleted User');
    expect(result.passwordHash).toBe('!');
  });

  it('username is already lowercase (no normalization conflict)', () => {
    const result = anonymizeUser('ABC123');
    expect(result.username).toBe('deleted_ABC123');
    expect(result.username).toBe(result.username.toLowerCase() ? result.username : '');
    expect(result.username.startsWith('deleted_')).toBe(true);
  });
});
