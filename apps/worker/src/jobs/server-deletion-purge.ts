import { createLogger, loadConfig, MinioObjectStorage, WorkerConfigSchema } from '@sovran/shared';
import { withTransaction, PgAttachmentRepository } from '@sovran/db';

const logger = createLogger({ name: 'worker:server-deletion-purge' });
const attachmentRepo = new PgAttachmentRepository();

export async function runServerDeletionPurgeJob(): Promise<void> {
  const config = loadConfig(WorkerConfigSchema);
  const objectStorage = new MinioObjectStorage({
    endpoint: config.MINIO_ENDPOINT,
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
    bucket: config.MINIO_BUCKET,
  });

  const serverIds = await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id FROM servers WHERE deleted_at IS NOT NULL LIMIT 50`,
    );
    return result.rows.map((r) => String(r.id));
  });

  for (const serverId of serverIds) {
    await purgeServerAttachments(serverId, objectStorage);
  }
}

async function purgeServerAttachments(
  serverId: string,
  objectStorage: MinioObjectStorage,
): Promise<void> {
  const attachments = await withTransaction((tx) =>
    attachmentRepo.listByServerId(tx, serverId),
  );
  if (attachments.length === 0) return;

  for (const att of attachments) {
    try {
      await objectStorage.deleteObject(att.objectKey);
    } catch {
      // Tolerate missing objects (NoSuchKey, etc.) — retry-safe
    }
  }

  await withTransaction(async (tx) => {
    for (const att of attachments) {
      await attachmentRepo.softDelete(tx, att.id);
    }
  });
  logger.info({ serverId, count: attachments.length }, 'Server attachments purged');
}
