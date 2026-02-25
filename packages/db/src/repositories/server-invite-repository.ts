import { type PoolClient } from 'pg';
import { type ServerInvite, type ServerInviteRepository } from '@sovran/domain';

export class PgServerInviteRepository implements ServerInviteRepository {
  async create(
    tx: unknown,
    invite: {
      id: string;
      serverId: string;
      codeHash: string;
      createdBy: string;
      expiresAt: Date;
      maxUses: number;
    },
  ): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `INSERT INTO server_invites (id, server_id, code_hash, created_by, expires_at, max_uses)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invite.id, invite.serverId, invite.codeHash, invite.createdBy, invite.expiresAt, invite.maxUses],
    );
  }

  async findByCodeHash(tx: unknown, codeHash: string): Promise<ServerInvite | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, server_id, code_hash, created_by, expires_at, max_uses, uses, revoked_at, created_at
       FROM server_invites WHERE code_hash = $1`,
      [codeHash],
    );
    return result.rows[0] ? mapInviteRow(result.rows[0]) : null;
  }

  async incrementUses(tx: unknown, id: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE server_invites SET uses = uses + 1 WHERE id = $1`,
      [id],
    );
  }

  async revoke(tx: unknown, id: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE server_invites SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
  }
}

function mapInviteRow(row: Record<string, unknown>): ServerInvite {
  return {
    id: String(row.id),
    serverId: String(row.server_id),
    codeHash: String(row.code_hash),
    createdBy: row.created_by ? String(row.created_by) : '',
    expiresAt: row.expires_at as Date,
    maxUses: Number(row.max_uses),
    uses: Number(row.uses),
    revokedAt: (row.revoked_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  };
}
