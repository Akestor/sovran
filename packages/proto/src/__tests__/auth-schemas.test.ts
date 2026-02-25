import { describe, it, expect } from 'vitest';
import {
  UsernameSchema,
  PasswordSchema,
  RegisterRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
} from '../api/auth';

describe('UsernameSchema', () => {
  it('normalizes to lowercase and trims', () => {
    const result = UsernameSchema.parse('  TestUser  ');
    expect(result).toBe('testuser');
  });

  it('rejects too short', () => {
    expect(() => UsernameSchema.parse('ab')).toThrow();
  });

  it('rejects too long', () => {
    expect(() => UsernameSchema.parse('a'.repeat(33))).toThrow();
  });

  it('rejects invalid characters', () => {
    expect(() => UsernameSchema.parse('user name')).toThrow();
    expect(() => UsernameSchema.parse('user@name')).toThrow();
    expect(() => UsernameSchema.parse('user!name')).toThrow();
  });

  it('accepts valid usernames', () => {
    expect(UsernameSchema.parse('alice')).toBe('alice');
    expect(UsernameSchema.parse('user.name')).toBe('user.name');
    expect(UsernameSchema.parse('user-name')).toBe('user-name');
    expect(UsernameSchema.parse('user_name')).toBe('user_name');
    expect(UsernameSchema.parse('user123')).toBe('user123');
  });
});

describe('PasswordSchema', () => {
  it('rejects too short', () => {
    expect(() => PasswordSchema.parse('short')).toThrow();
  });

  it('rejects too long', () => {
    expect(() => PasswordSchema.parse('a'.repeat(129))).toThrow();
  });

  it('accepts valid password', () => {
    expect(PasswordSchema.parse('securepassword123')).toBe('securepassword123');
  });
});

describe('RegisterRequestSchema', () => {
  it('validates a complete registration', () => {
    const result = RegisterRequestSchema.parse({
      username: 'Alice',
      password: 'password123',
      inviteCode: 'abc-123-def',
    });
    expect(result.username).toBe('alice');
    expect(result.inviteCode).toBe('abc-123-def');
    expect(result.displayName).toBeUndefined();
  });

  it('accepts optional displayName', () => {
    const result = RegisterRequestSchema.parse({
      username: 'bob',
      password: 'password123',
      displayName: ' Bob the Builder ',
      inviteCode: 'code-1',
    });
    expect(result.displayName).toBe('Bob the Builder');
  });

  it('rejects missing inviteCode', () => {
    expect(() =>
      RegisterRequestSchema.parse({
        username: 'alice',
        password: 'password123',
      }),
    ).toThrow();
  });
});

describe('LoginRequestSchema', () => {
  it('validates login and normalizes username', () => {
    const result = LoginRequestSchema.parse({
      username: ' Alice ',
      password: 'password123',
    });
    expect(result.username).toBe('alice');
  });
});

describe('RefreshRequestSchema', () => {
  it('validates refresh token request', () => {
    const result = RefreshRequestSchema.parse({
      refreshToken: 'some-opaque-token',
    });
    expect(result.refreshToken).toBe('some-opaque-token');
  });

  it('rejects empty refresh token', () => {
    expect(() => RefreshRequestSchema.parse({ refreshToken: '' })).toThrow();
  });
});
