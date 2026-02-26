import { type PoolClient } from 'pg';
import type { Attachment, AttachmentRepository, MessageAttachmentRepository } from '@sovran/domain';

export class PgAttachmentRepository implements AttachmentRepository {
  async create(
    tx: unknown,
    att: {
      id: string;
      serverId: string;
      channelId: string;
      uploaderId: string;
      objectKey: string;
      filename: string;
      contentType: string;
      sizeBytes: number;
    },
  ): Promise<Attachment> {
    const client = tx as PoolClient;
    const result = await client.query(
      `INSERT INTO attachments (id, server_id, channel_id, uploader_id, object_key, filename, content_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, server_id, channel_id, uploader_id, object_key, filename, content_type, size_bytes, status, created_at, deleted_at`,
      [
        att.id,
        att.serverId,
        att.channelId,
        att.uploaderId,
        att.objectKey,
        att.filename,
        att.contentType,
        att.sizeBytes,
      ],
    );
    return mapAttachmentRow(result.rows[0]);
  }

  async findById(tx: unknown, id: string): Promise<Attachment | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, server_id, channel_id, uploader_id, object_key, filename, content_type, size_bytes, status, created_at, deleted_at
       FROM attachments WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ? mapAttachmentRow(result.rows[0]) : null;
  }

  async updateStatus(tx: unknown, id: string, status: Attachment['status']): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE attachments SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
      [status, id],
    );
  }

  async softDelete(tx: unknown, id: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE attachments SET deleted_at = NOW(), status = 'deleted' WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async findByIds(tx: unknown, ids: string[]): Promise<Attachment[]> {
    if (ids.length === 0) return [];
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, server_id, channel_id, uploader_id, object_key, filename, content_type, size_bytes, status, created_at, deleted_at
       FROM attachments WHERE id = ANY($1::varchar[]) AND deleted_at IS NULL`,
      [ids],
    );
    return result.rows.map(mapAttachmentRow);
  }

  async listByStatus(tx: unknown, status: Attachment['status']): Promise<Attachment[]> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, server_id, channel_id, uploader_id, object_key, filename, content_type, size_bytes, status, created_at, deleted_at
       FROM attachments WHERE status = $1 AND deleted_at IS NULL`,
      [status],
    );
    return result.rows.map(mapAttachmentRow);
  }

  async claimForScanning(tx: unknown, limit: number): Promise<Attachment[]> {
    const client = tx as PoolClient;
    const result = await client.query(
      `UPDATE attachments SET status = 'scanning', updated_at = NOW()
       WHERE id IN (
         SELECT id FROM attachments
         WHERE status = 'uploaded' AND deleted_at IS NULL
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, server_id, channel_id, uploader_id, object_key, filename, content_type, size_bytes, status, created_at, deleted_at`,
      [limit],
    );
    return result.rows.map(mapAttachmentRow);
  }

  async revertStuckScanning(tx: unknown, olderThanMs: number): Promise<number> {
    const client = tx as PoolClient;
    const result = await client.query(
      `UPDATE attachments SET status = 'uploaded', updated_at = NOW()
       WHERE status = 'scanning' AND deleted_at IS NULL
         AND updated_at < NOW() - ($1::bigint * interval '1 millisecond')
       RETURNING id`,
      [olderThanMs],
    );
    return result.rowCount ?? 0;
  }

  async listByServerId(tx: unknown, serverId: string): Promise<Attachment[]> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, server_id, channel_id, uploader_id, object_key, filename, content_type, size_bytes, status, created_at, deleted_at
       FROM attachments WHERE server_id = $1 AND deleted_at IS NULL`,
      [serverId],
    );
    return result.rows.map(mapAttachmentRow);
  }

  /** DSAR export: attachment metadata for user (uploader). No object_key, no download URLs. */
  async listDsarMetadataByUploaderId(tx: unknown, userId: string): Promise<
    Array<{ id: string; filename: string; contentType: string; sizeBytes: number; createdAt: Date; serverId: string; channelId: string; messageId: string | null }>
  > {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT a.id, a.filename, a.content_type, a.size_bytes, a.created_at, a.server_id, a.channel_id,
              (SELECT ma.message_id FROM message_attachments ma WHERE ma.attachment_id = a.id LIMIT 1) AS message_id
       FROM attachments a
       WHERE a.uploader_id = $1 AND a.deleted_at IS NULL`,
      [userId],
    );
    return result.rows.map((r) => ({
      id: String(r.id),
      filename: String(r.filename),
      contentType: String(r.content_type),
      sizeBytes: Number(r.size_bytes),
      createdAt: r.created_at as Date,
      serverId: String(r.server_id),
      channelId: String(r.channel_id),
      messageId: r.message_id != null ? String(r.message_id) : null,
    }));
  }
}

export class PgMessageAttachmentRepository implements MessageAttachmentRepository {
  async link(tx: unknown, messageId: string, attachmentIds: string[]): Promise<void> {
    if (attachmentIds.length === 0) return;
    const client = tx as PoolClient;
    const values = attachmentIds
      .map((_, i) => `($1, $${i + 2}, ${i})`)
      .join(', ');
    const params = [messageId, ...attachmentIds];
    await client.query(
      `INSERT INTO message_attachments (message_id, attachment_id, position) VALUES ${values}`,
      params,
    );
  }

  async listByMessageId(tx: unknown, messageId: string): Promise<Attachment[]> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT a.id, a.server_id, a.channel_id, a.uploader_id, a.object_key, a.filename, a.content_type, a.size_bytes, a.status, a.created_at, a.deleted_at
       FROM attachments a
       JOIN message_attachments ma ON ma.attachment_id = a.id
       WHERE ma.message_id = $1 AND a.deleted_at IS NULL
       ORDER BY ma.position ASC`,
      [messageId],
    );
    return result.rows.map(mapAttachmentRow);
  }
}

function mapAttachmentRow(row: Record<string, unknown>): Attachment {
  return {
    id: String(row.id),
    serverId: String(row.server_id),
    channelId: String(row.channel_id),
    uploaderId: row.uploader_id != null ? String(row.uploader_id) : null,
    objectKey: String(row.object_key),
    filename: String(row.filename),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    status: row.status as Attachment['status'],
    createdAt: row.created_at as Date,
    deletedAt: (row.deleted_at as Date | null) ?? null,
  };
}
