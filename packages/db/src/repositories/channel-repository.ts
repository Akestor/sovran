import { type PoolClient } from 'pg';
import { type Channel, type ChannelRepository } from '@sovran/domain';

export class PgChannelRepository implements ChannelRepository {
  async create(
    tx: unknown,
    channel: { id: string; serverId: string; name: string; type: string; position: number },
  ): Promise<Channel> {
    const client = tx as PoolClient;
    const result = await client.query(
      `INSERT INTO channels (id, server_id, name, type, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, server_id, name, type, position, created_at, updated_at, deleted_at`,
      [channel.id, channel.serverId, channel.name, channel.type, channel.position],
    );
    return mapChannelRow(result.rows[0]);
  }

  async findById(tx: unknown, id: string): Promise<Channel | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, server_id, name, type, position, created_at, updated_at, deleted_at
       FROM channels WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ? mapChannelRow(result.rows[0]) : null;
  }

  async findByServerAndName(tx: unknown, serverId: string, name: string): Promise<Channel | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, server_id, name, type, position, created_at, updated_at, deleted_at
       FROM channels WHERE server_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [serverId, name],
    );
    return result.rows[0] ? mapChannelRow(result.rows[0]) : null;
  }

  async rename(tx: unknown, id: string, name: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE channels SET name = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id, name],
    );
  }

  async softDelete(tx: unknown, id: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE channels SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async listByServerId(tx: unknown, serverId: string): Promise<Channel[]> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, server_id, name, type, position, created_at, updated_at, deleted_at
       FROM channels WHERE server_id = $1 AND deleted_at IS NULL
       ORDER BY position ASC, created_at ASC`,
      [serverId],
    );
    return result.rows.map(mapChannelRow);
  }

  async countByServerId(tx: unknown, serverId: string): Promise<number> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM channels WHERE server_id = $1 AND deleted_at IS NULL`,
      [serverId],
    );
    return result.rows[0].count;
  }
}

function mapChannelRow(row: Record<string, unknown>): Channel {
  return {
    id: String(row.id),
    serverId: String(row.server_id),
    name: String(row.name),
    type: String(row.type),
    position: Number(row.position),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    deletedAt: (row.deleted_at as Date | null) ?? null,
  };
}
