import { type PoolClient } from 'pg';
import { type RefreshToken, type RefreshTokenRepository } from '@sovran/domain';

export class PgRefreshTokenRepository implements RefreshTokenRepository {
  async create(
    tx: unknown,
    token: {
      id: string;
      userId: string;
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
    },
  ): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [token.id, token.userId, token.tokenHash, token.familyId, token.expiresAt],
    );
  }

  async findByTokenHash(tx: unknown, hash: string): Promise<RefreshToken | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, user_id, token_hash, family_id, expires_at, revoked_at, created_at
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [hash],
    );
    return result.rows[0] ? mapRefreshRow(result.rows[0]) : null;
  }

  async revokeFamily(tx: unknown, familyId: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId],
    );
  }

  async revokeAllForUser(tx: unknown, userId: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  async deleteExpired(tx: unknown, olderThanDays: number): Promise<number> {
    const client = tx as PoolClient;
    const result = await client.query(
      `DELETE FROM refresh_tokens
       WHERE (expires_at < NOW() - make_interval(days => $1))
          OR (revoked_at IS NOT NULL AND revoked_at < NOW() - make_interval(days => $1))`,
      [olderThanDays],
    );
    return result.rowCount ?? 0;
  }
}

function mapRefreshRow(row: Record<string, unknown>): RefreshToken {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    familyId: String(row.family_id),
    expiresAt: row.expires_at as Date,
    revokedAt: (row.revoked_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  };
}
