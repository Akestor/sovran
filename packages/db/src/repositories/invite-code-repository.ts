import { type PoolClient } from 'pg';
import { type InviteCode, type InviteCodeRepository } from '@sovran/domain';

export class PgInviteCodeRepository implements InviteCodeRepository {
  async findByCodeHash(tx: unknown, codeHash: string): Promise<InviteCode | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, code_hash, created_by, expires_at, max_uses, use_count, created_at
       FROM invite_codes
       WHERE code_hash = $1`,
      [codeHash],
    );
    return result.rows[0] ? mapInviteRow(result.rows[0]) : null;
  }

  async incrementUseCount(tx: unknown, id: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE invite_codes SET use_count = use_count + 1 WHERE id = $1`,
      [id],
    );
  }
}

function mapInviteRow(row: Record<string, unknown>): InviteCode {
  return {
    id: String(row.id),
    codeHash: String(row.code_hash),
    createdBy: row.created_by ? String(row.created_by) : null,
    expiresAt: row.expires_at as Date,
    maxUses: Number(row.max_uses),
    useCount: Number(row.use_count),
    createdAt: row.created_at as Date,
  };
}
