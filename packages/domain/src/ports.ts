import { type User, type RefreshToken, type InviteCode } from './user';

export interface OutboxPort {
  append(
    tx: unknown,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    },
  ): Promise<string>;
}

export interface DedupePort {
  check(userId: string, clientMutationId: string): Promise<{ isDuplicate: boolean }>;
  mark(userId: string, clientMutationId: string, ttlSeconds?: number): Promise<void>;
}

export interface UserRepository {
  create(
    tx: unknown,
    user: { id: string; username: string; displayName: string; passwordHash: string },
  ): Promise<User>;
  findByUsername(tx: unknown, username: string): Promise<User | null>;
  findById(tx: unknown, id: string): Promise<User | null>;
  softDelete(tx: unknown, id: string): Promise<void>;
}

export interface RefreshTokenRepository {
  create(
    tx: unknown,
    token: {
      id: string;
      userId: string;
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
    },
  ): Promise<void>;
  findByTokenHash(tx: unknown, hash: string): Promise<RefreshToken | null>;
  revokeFamily(tx: unknown, familyId: string): Promise<void>;
  revokeAllForUser(tx: unknown, userId: string): Promise<void>;
  deleteExpired(tx: unknown, olderThanDays: number): Promise<number>;
}

export interface InviteCodeRepository {
  findByCodeHash(tx: unknown, codeHash: string): Promise<InviteCode | null>;
  incrementUseCount(tx: unknown, id: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export interface TokenService {
  signAccessToken(userId: string): Promise<string>;
  verifyAccessToken(token: string): Promise<{ userId: string }>;
  generateRefreshToken(): string;
  hashRefreshToken(token: string): string;
}
