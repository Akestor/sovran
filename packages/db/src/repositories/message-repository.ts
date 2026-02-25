import { type PoolClient } from 'pg';
import { type Message, type MessageRepository } from '@sovran/domain';

export class PgMessageRepository implements MessageRepository {
  async create(
    tx: unknown,
    msg: { id: string; channelId: string; serverId: string; authorId: string; content: string },
  ): Promise<Message> {
    const client = tx as PoolClient;
    const result = await client.query(
      `INSERT INTO messages (id, channel_id, server_id, author_id, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, channel_id, server_id, author_id, content, edited_at, deleted_at, created_at`,
      [msg.id, msg.channelId, msg.serverId, msg.authorId, msg.content],
    );
    return mapMessageRow(result.rows[0]);
  }

  async findById(tx: unknown, id: string): Promise<Message | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, channel_id, server_id, author_id, content, edited_at, deleted_at, created_at
       FROM messages WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapMessageRow(result.rows[0]) : null;
  }

  async listByChannel(
    tx: unknown,
    channelId: string,
    opts: { before?: string; limit: number },
  ): Promise<Message[]> {
    const client = tx as PoolClient;

    if (opts.before) {
      const result = await client.query(
        `SELECT id, channel_id, server_id, author_id, content, edited_at, deleted_at, created_at
         FROM messages
         WHERE channel_id = $1 AND id < $2 AND deleted_at IS NULL
         ORDER BY id DESC
         LIMIT $3`,
        [channelId, opts.before, opts.limit],
      );
      return result.rows.map(mapMessageRow);
    }

    const result = await client.query(
      `SELECT id, channel_id, server_id, author_id, content, edited_at, deleted_at, created_at
       FROM messages
       WHERE channel_id = $1 AND deleted_at IS NULL
       ORDER BY id DESC
       LIMIT $2`,
      [channelId, opts.limit],
    );
    return result.rows.map(mapMessageRow);
  }

  async softDelete(tx: unknown, id: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }
}

function mapMessageRow(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    serverId: String(row.server_id),
    authorId: String(row.author_id),
    content: String(row.content),
    editedAt: (row.edited_at as Date | null) ?? null,
    deletedAt: (row.deleted_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  };
}
