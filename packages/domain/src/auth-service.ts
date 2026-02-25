import { type User } from './user';
import { isUsernameReserved, isAccountDeleted, isTokenExpired } from './auth';
import {
  type UserRepository,
  type RefreshTokenRepository,
  type InviteCodeRepository,
  type PasswordHasher,
  type TokenService,
  type OutboxPort,
} from './ports';

export interface AuthServiceDeps {
  userRepo: UserRepository;
  refreshTokenRepo: RefreshTokenRepository;
  inviteCodeRepo: InviteCodeRepository;
  passwordHasher: PasswordHasher;
  tokenService: TokenService;
  outbox: OutboxPort;
  generateId: () => string;
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  refreshTokenTtlDays: number;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; displayName: string };
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async register(input: {
    username: string;
    password: string;
    displayName?: string;
    inviteCode: string;
  }): Promise<AuthResult> {
    const { userRepo, refreshTokenRepo, inviteCodeRepo, passwordHasher, tokenService, outbox, generateId } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      if (isUsernameReserved(input.username)) {
        throw new AuthError('CONFLICT', 'Username is not available');
      }

      const existing = await userRepo.findByUsername(tx, input.username);
      if (existing) {
        throw new AuthError('CONFLICT', 'Username is not available');
      }

      const codeHash = tokenService.hashRefreshToken(input.inviteCode);
      const invite = await inviteCodeRepo.findByCodeHash(tx, codeHash);

      if (!invite) {
        throw new AuthError('VALIDATION', 'Invalid invite code');
      }
      if (invite.expiresAt.getTime() <= Date.now()) {
        throw new AuthError('VALIDATION', 'Invite code has expired');
      }
      if (invite.useCount >= invite.maxUses) {
        throw new AuthError('VALIDATION', 'Invite code has been fully used');
      }

      await inviteCodeRepo.incrementUseCount(tx, invite.id);

      const userId = generateId();
      const passwordHash = await passwordHasher.hash(input.password);

      const user = await userRepo.create(tx, {
        id: userId,
        username: input.username,
        displayName: input.displayName ?? input.username,
        passwordHash,
      });

      const accessToken = await tokenService.signAccessToken(userId);
      const rawRefresh = tokenService.generateRefreshToken();
      const refreshHash = tokenService.hashRefreshToken(rawRefresh);
      const familyId = generateId();

      await refreshTokenRepo.create(tx, {
        id: generateId(),
        userId,
        tokenHash: refreshHash,
        familyId,
        expiresAt: this.refreshTokenExpiry(),
      });

      await outbox.append(tx, {
        aggregateType: 'user',
        aggregateId: userId,
        eventType: 'USER_REGISTERED',
        payload: { userId },
      });

      return {
        accessToken,
        refreshToken: rawRefresh,
        user: { id: user.id, username: user.username, displayName: user.displayName },
      };
    });
  }

  async login(input: { username: string; password: string }): Promise<AuthResult> {
    const { userRepo, refreshTokenRepo, passwordHasher, tokenService, generateId } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const user = await userRepo.findByUsername(tx, input.username);
      if (!user) {
        throw new AuthError('UNAUTHORIZED', 'Invalid credentials');
      }
      if (isAccountDeleted(user)) {
        throw new AuthError('UNAUTHORIZED', 'Invalid credentials');
      }

      const valid = await passwordHasher.verify(input.password, user.passwordHash);
      if (!valid) {
        throw new AuthError('UNAUTHORIZED', 'Invalid credentials');
      }

      const accessToken = await tokenService.signAccessToken(user.id);
      const rawRefresh = tokenService.generateRefreshToken();
      const refreshHash = tokenService.hashRefreshToken(rawRefresh);
      const familyId = generateId();

      await refreshTokenRepo.create(tx, {
        id: generateId(),
        userId: user.id,
        tokenHash: refreshHash,
        familyId,
        expiresAt: this.refreshTokenExpiry(),
      });

      return {
        accessToken,
        refreshToken: rawRefresh,
        user: { id: user.id, username: user.username, displayName: user.displayName },
      };
    });
  }

  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { refreshTokenRepo, tokenService, generateId } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const tokenHash = tokenService.hashRefreshToken(rawRefreshToken);
      const stored = await refreshTokenRepo.findByTokenHash(tx, tokenHash);

      if (!stored) {
        throw new AuthError('UNAUTHORIZED', 'Invalid refresh token');
      }

      if (stored.revokedAt) {
        await refreshTokenRepo.revokeFamily(tx, stored.familyId);
        throw new AuthError('UNAUTHORIZED', 'Refresh token reuse detected');
      }

      if (isTokenExpired(stored.expiresAt)) {
        throw new AuthError('UNAUTHORIZED', 'Refresh token expired');
      }

      await refreshTokenRepo.revokeFamily(tx, stored.familyId);

      const accessToken = await tokenService.signAccessToken(stored.userId);
      const newRawRefresh = tokenService.generateRefreshToken();
      const newRefreshHash = tokenService.hashRefreshToken(newRawRefresh);

      await refreshTokenRepo.create(tx, {
        id: generateId(),
        userId: stored.userId,
        tokenHash: newRefreshHash,
        familyId: stored.familyId,
        expiresAt: this.refreshTokenExpiry(),
      });

      return { accessToken, refreshToken: newRawRefresh };
    });
  }

  async logout(userId: string): Promise<void> {
    return this.deps.withTransaction(async (tx) => {
      await this.deps.refreshTokenRepo.revokeAllForUser(tx, userId);
    });
  }

  async getMe(userId: string): Promise<User | null> {
    return this.deps.withTransaction(async (tx) => {
      const user = await this.deps.userRepo.findById(tx, userId);
      if (!user || isAccountDeleted(user)) return null;
      return user;
    });
  }

  private refreshTokenExpiry(): Date {
    return new Date(Date.now() + this.deps.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  }
}

export class AuthError extends Error {
  constructor(
    public readonly kind: 'UNAUTHORIZED' | 'CONFLICT' | 'VALIDATION' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
