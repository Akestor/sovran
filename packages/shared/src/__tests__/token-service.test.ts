import { describe, it, expect } from 'vitest';
import { JoseTokenService } from '../auth/token-service';

function createService(overrides: Partial<{ activeKid: string; keys: Array<{ kid: string; secret: string }>; accessTokenTtl: string }> = {}) {
  return new JoseTokenService({
    activeKid: overrides.activeKid ?? 'key-1',
    keys: overrides.keys ?? [
      { kid: 'key-1', secret: 'a'.repeat(32) },
      { kid: 'key-2', secret: 'b'.repeat(32) },
    ],
    accessTokenTtl: overrides.accessTokenTtl ?? '900',
  });
}

describe('JoseTokenService', () => {
  it('signs and verifies an access token', async () => {
    const service = createService();
    const token = await service.signAccessToken('user-123');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const result = await service.verifyAccessToken(token);
    expect(result.userId).toBe('user-123');
  });

  it('verifies token signed with old key after rotation', async () => {
    const serviceOld = createService({ activeKid: 'key-1' });
    const token = await serviceOld.signAccessToken('user-456');

    const serviceNew = createService({ activeKid: 'key-2' });
    const result = await serviceNew.verifyAccessToken(token);
    expect(result.userId).toBe('user-456');
  });

  it('rejects token signed with unknown key', async () => {
    const service1 = new JoseTokenService({
      activeKid: 'unknown-key',
      keys: [{ kid: 'unknown-key', secret: 'x'.repeat(32) }],
      accessTokenTtl: '900',
    });
    const token = await service1.signAccessToken('user-789');

    const service2 = createService();
    await expect(service2.verifyAccessToken(token)).rejects.toThrow();
  });

  it('throws if active kid is not found in keys', () => {
    expect(() =>
      new JoseTokenService({
        activeKid: 'nonexistent',
        keys: [{ kid: 'key-1', secret: 'a'.repeat(32) }],
        accessTokenTtl: '900',
      }),
    ).toThrow("Active JWT key 'nonexistent' not found in keys");
  });

  it('generates opaque refresh tokens', () => {
    const service = createService();
    const t1 = service.generateRefreshToken();
    const t2 = service.generateRefreshToken();
    expect(typeof t1).toBe('string');
    expect(t1.length).toBeGreaterThan(20);
    expect(t1).not.toBe(t2);
  });

  it('hashes refresh tokens deterministically', () => {
    const service = createService();
    const token = 'some-refresh-token';
    const h1 = service.hashRefreshToken(token);
    const h2 = service.hashRefreshToken(token);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('different tokens produce different hashes', () => {
    const service = createService();
    const h1 = service.hashRefreshToken('token-a');
    const h2 = service.hashRefreshToken('token-b');
    expect(h1).not.toBe(h2);
  });
});
