import { describe, it, expect } from 'vitest';
import { JwtConfigSchema } from '../config';

describe('JwtConfigSchema', () => {
  const validKeys = JSON.stringify([
    { kid: 'key-1', secret: 'a'.repeat(32) },
    { kid: 'key-2', secret: 'b'.repeat(32) },
  ]);

  it('parses valid JWT config', () => {
    const result = JwtConfigSchema.parse({
      JWT_ACTIVE_KID: 'key-1',
      JWT_KEYS: validKeys,
    });
    expect(result.JWT_ACTIVE_KID).toBe('key-1');
    expect(result.JWT_KEYS).toHaveLength(2);
    expect(result.JWT_KEYS[0].kid).toBe('key-1');
    expect(result.JWT_ACCESS_TOKEN_TTL).toBe('900');
    expect(result.JWT_REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it('rejects missing JWT_ACTIVE_KID', () => {
    expect(() =>
      JwtConfigSchema.parse({
        JWT_KEYS: validKeys,
      }),
    ).toThrow();
  });

  it('rejects empty JWT_KEYS', () => {
    expect(() =>
      JwtConfigSchema.parse({
        JWT_ACTIVE_KID: 'key-1',
        JWT_KEYS: '[]',
      }),
    ).toThrow();
  });

  it('rejects secret shorter than 32 chars', () => {
    const shortSecret = JSON.stringify([{ kid: 'key-1', secret: 'short' }]);
    expect(() =>
      JwtConfigSchema.parse({
        JWT_ACTIVE_KID: 'key-1',
        JWT_KEYS: shortSecret,
      }),
    ).toThrow();
  });

  it('supports key rotation (multiple keys)', () => {
    const result = JwtConfigSchema.parse({
      JWT_ACTIVE_KID: 'key-2',
      JWT_KEYS: validKeys,
    });
    expect(result.JWT_ACTIVE_KID).toBe('key-2');
    expect(result.JWT_KEYS.find((k) => k.kid === 'key-2')).toBeDefined();
  });
});
