import { describe, it, expect } from 'vitest';
import { Argon2PasswordHasher } from '../auth/password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes a password and returns an argon2id hash string', async () => {
    const hash = await hasher.hash('securePassword123');
    expect(hash).toMatch(/^\$argon2/);
    expect(hash.length).toBeGreaterThan(50);
  });

  it('verifies a correct password', async () => {
    const hash = await hasher.hash('myPassword');
    const valid = await hasher.verify('myPassword', hash);
    expect(valid).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hasher.hash('myPassword');
    const valid = await hasher.verify('wrongPassword', hash);
    expect(valid).toBe(false);
  });

  it('rejects the invalid "!" hash (anonymized user)', async () => {
    const valid = await hasher.verify('anyPassword', '!');
    expect(valid).toBe(false);
  });

  it('returns false for corrupted hash strings', async () => {
    const valid = await hasher.verify('password', 'not-a-valid-hash');
    expect(valid).toBe(false);
  });

  it('produces different hashes for the same password (salt)', async () => {
    const hash1 = await hasher.hash('samePassword');
    const hash2 = await hasher.hash('samePassword');
    expect(hash1).not.toBe(hash2);
  });
});
