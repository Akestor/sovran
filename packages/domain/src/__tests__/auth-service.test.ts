import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService, AuthError, type AuthServiceDeps } from '../auth-service';
import { type User, type RefreshToken, type InviteCode } from '../user';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '100',
    username: 'alice',
    displayName: 'Alice',
    passwordHash: '$argon2id$hash',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: '200',
    userId: '100',
    tokenHash: 'hashed-token',
    familyId: '300',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeInviteCode(overrides: Partial<InviteCode> = {}): InviteCode {
  return {
    id: '400',
    codeHash: 'hashed-invite',
    createdBy: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    maxUses: 1,
    useCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<AuthServiceDeps> = {}): AuthServiceDeps {
  let idCounter = 1000;
  return {
    userRepo: {
      create: vi.fn(async (_tx, user) => makeUser({ id: user.id, username: user.username, displayName: user.displayName })),
      findByUsername: vi.fn(async () => null),
      findById: vi.fn(async () => null),
      softDelete: vi.fn(async () => {}),
    },
    refreshTokenRepo: {
      create: vi.fn(async () => {}),
      findByTokenHash: vi.fn(async () => null),
      revokeFamily: vi.fn(async () => {}),
      revokeAllForUser: vi.fn(async () => {}),
      deleteExpired: vi.fn(async () => 0),
    },
    inviteCodeRepo: {
      findByCodeHash: vi.fn(async () => makeInviteCode()),
      incrementUseCount: vi.fn(async () => {}),
    },
    passwordHasher: {
      hash: vi.fn(async (p: string) => `hashed:${p}`),
      verify: vi.fn(async (p: string, h: string) => h === `hashed:${p}`),
    },
    tokenService: {
      signAccessToken: vi.fn(async () => 'access-token-jwt'),
      verifyAccessToken: vi.fn(async () => ({ userId: '100' })),
      generateRefreshToken: vi.fn(() => 'raw-refresh-token'),
      hashRefreshToken: vi.fn((t: string) => `sha256:${t}`),
    },
    outbox: {
      append: vi.fn(async () => '999'),
    },
    generateId: vi.fn(() => String(idCounter++)),
    withTransaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>) => fn({})),
    refreshTokenTtlDays: 30,
    ...overrides,
  };
}

describe('AuthService', () => {
  let deps: AuthServiceDeps;
  let service: AuthService;

  beforeEach(() => {
    deps = createMockDeps();
    service = new AuthService(deps);
  });

  describe('register', () => {
    it('creates user and returns tokens', async () => {
      const result = await service.register({
        username: 'bob',
        password: 'securepassword',
        inviteCode: 'valid-code',
      });

      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.refreshToken).toBe('raw-refresh-token');
      expect(result.user.username).toBe('bob');
      expect(deps.userRepo.create).toHaveBeenCalledOnce();
      expect(deps.refreshTokenRepo.create).toHaveBeenCalledOnce();
      expect(deps.outbox.append).toHaveBeenCalledOnce();
      expect(deps.inviteCodeRepo.incrementUseCount).toHaveBeenCalledOnce();
    });

    it('uses username as displayName when not provided', async () => {
      const result = await service.register({
        username: 'charlie',
        password: 'securepassword',
        inviteCode: 'valid-code',
      });

      expect(result.user.displayName).toBe('charlie');
    });

    it('rejects reserved username', async () => {
      await expect(
        service.register({ username: 'admin', password: 'pass1234', inviteCode: 'code' }),
      ).rejects.toThrow(AuthError);

      await expect(
        service.register({ username: 'admin', password: 'pass1234', inviteCode: 'code' }),
      ).rejects.toMatchObject({ kind: 'CONFLICT' });
    });

    it('rejects duplicate username', async () => {
      (deps.userRepo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeUser());

      await expect(
        service.register({ username: 'alice', password: 'pass1234', inviteCode: 'code' }),
      ).rejects.toThrow(AuthError);
    });

    it('rejects invalid invite code', async () => {
      (deps.inviteCodeRepo.findByCodeHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      await expect(
        service.register({ username: 'newuser', password: 'pass1234', inviteCode: 'bad-code' }),
      ).rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('rejects expired invite code', async () => {
      (deps.inviteCodeRepo.findByCodeHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeInviteCode({ expiresAt: new Date('2020-01-01') }),
      );

      await expect(
        service.register({ username: 'newuser', password: 'pass1234', inviteCode: 'expired' }),
      ).rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('rejects fully used invite code', async () => {
      (deps.inviteCodeRepo.findByCodeHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeInviteCode({ useCount: 1, maxUses: 1 }),
      );

      await expect(
        service.register({ username: 'newuser', password: 'pass1234', inviteCode: 'used' }),
      ).rejects.toMatchObject({ kind: 'VALIDATION' });
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      (deps.userRepo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeUser({ passwordHash: 'hashed:correctpassword' }),
      );

      const result = await service.login({ username: 'alice', password: 'correctpassword' });

      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.refreshToken).toBe('raw-refresh-token');
      expect(result.user.id).toBe('100');
    });

    it('rejects unknown user', async () => {
      await expect(
        service.login({ username: 'unknown', password: 'pass1234' }),
      ).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    });

    it('rejects wrong password', async () => {
      (deps.userRepo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeUser({ passwordHash: 'hashed:correctpassword' }),
      );

      await expect(
        service.login({ username: 'alice', password: 'wrongpassword' }),
      ).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    });

    it('rejects deleted user', async () => {
      (deps.userRepo.findByUsername as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeUser({ deletedAt: new Date() }),
      );

      await expect(
        service.login({ username: 'alice', password: 'pass1234' }),
      ).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    });
  });

  describe('refresh', () => {
    it('rotates tokens successfully', async () => {
      (deps.refreshTokenRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeRefreshToken(),
      );

      const result = await service.refresh('some-raw-token');

      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.refreshToken).toBe('raw-refresh-token');
      expect(deps.refreshTokenRepo.revokeFamily).toHaveBeenCalledOnce();
      expect(deps.refreshTokenRepo.create).toHaveBeenCalledOnce();
    });

    it('rejects unknown refresh token', async () => {
      await expect(service.refresh('unknown-token')).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    });

    it('revokes family on reuse of revoked token', async () => {
      (deps.refreshTokenRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeRefreshToken({ revokedAt: new Date() }),
      );

      await expect(service.refresh('reused-token')).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
      expect(deps.refreshTokenRepo.revokeFamily).toHaveBeenCalledOnce();
    });

    it('rejects expired refresh token', async () => {
      (deps.refreshTokenRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeRefreshToken({ expiresAt: new Date('2020-01-01') }),
      );

      await expect(service.refresh('expired-token')).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    });
  });

  describe('logout', () => {
    it('revokes all refresh tokens for user', async () => {
      await service.logout('100');
      expect(deps.refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith({}, '100');
    });
  });

  describe('getMe', () => {
    it('returns user when found', async () => {
      (deps.userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeUser());
      const user = await service.getMe('100');
      expect(user?.id).toBe('100');
      expect(user?.username).toBe('alice');
    });

    it('returns null for unknown user', async () => {
      const user = await service.getMe('unknown');
      expect(user).toBeNull();
    });

    it('returns null for deleted user', async () => {
      (deps.userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeUser({ deletedAt: new Date() }),
      );
      const user = await service.getMe('100');
      expect(user).toBeNull();
    });
  });
});
