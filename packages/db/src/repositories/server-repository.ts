import { type PoolClient } from 'pg';
import { type Server, type MemberRole, type ServerRepository } from '@sovran/domain';

export class PgServerRepository implements ServerRepository {
  async create(
    tx: unknown,
    server: { id: string; name: string; ownerId: string },
  ): Promise<Server> {
    const client = tx as PoolClient;
    const result = await client.query(
      `INSERT INTO servers (id, name, owner_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, owner_id, created_at, updated_at, deleted_at`,
      [server.id, server.name, server.ownerId],
    );
    return mapServerRow(result.rows[0]);
  }

  async findById(tx: unknown, id: string): Promise<Server | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, name, owner_id, created_at, updated_at, deleted_at
       FROM servers WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ? mapServerRow(result.rows[0]) : null;
  }

  async updateOwner(tx: unknown, serverId: string, newOwnerId: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE servers SET owner_id = $2, updated_at = NOW() WHERE id = $1`,
      [serverId, newOwnerId],
    );
  }

  async softDelete(tx: unknown, id: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE servers SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async listByUserId(
    tx: unknown,
    userId: string,
  ): Promise<Array<{ id: string; name: string; role: MemberRole }>> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT s.id, s.name, m.role
       FROM servers s
       INNER JOIN members m ON m.server_id = s.id
       WHERE m.user_id = $1 AND s.deleted_at IS NULL
       ORDER BY m.created_at ASC`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      role: String(row.role) as MemberRole,
    }));
  }
}

function mapServerRow(row: Record<string, unknown>): Server {
  return {
    id: String(row.id),
    name: String(row.name),
    ownerId: String(row.owner_id),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    deletedAt: (row.deleted_at as Date | null) ?? null,
  };
}
