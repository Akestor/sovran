import { createLogger, loadConfig, MinioObjectStorage, WorkerConfigSchema } from '@sovran/shared';
import { withTransaction, PgAttachmentRepository } from '@sovran/db';
import type { Attachment } from '@sovran/domain';
import { scanStream } from '../clamav';

const logger = createLogger({ name: 'worker:attachment-scan' });
const attachmentRepo = new PgAttachmentRepository();

export async function runAttachmentScanJob(): Promise<void> {
  const config = loadConfig(WorkerConfigSchema);
  const objectStorage = new MinioObjectStorage({
    endpoint: config.MINIO_ENDPOINT,
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
    bucket: config.MINIO_BUCKET,
  });

  const claimed = await withTransaction(async (tx) => {
    const reverted = await attachmentRepo.revertStuckScanning(tx, config.ATTACHMENT_SCAN_STUCK_MS);
    if (reverted > 0) {
      logger.info({ count: reverted }, 'Reverted stuck scanning attachments');
    }
    return attachmentRepo.claimForScanning(tx, config.ATTACHMENT_SCAN_CONCURRENCY);
  });

  if (claimed.length === 0) return;

  for (const att of claimed) {
    await processAttachment(att, objectStorage, config.CLAMAV_HOST, config.CLAMAV_PORT);
  }
}

async function processAttachment(
  att: Attachment,
  objectStorage: MinioObjectStorage,
  clamHost: string,
  clamPort: number,
): Promise<void> {
  try {
    const stream = await objectStorage.getObjectStream(att.objectKey);
    const result = await scanStream(clamHost, clamPort, stream);

    if (result.ok) {
      await withTransaction(async (tx) => {
        await attachmentRepo.updateStatus(tx, att.id, 'scanned');
      });
      logger.info({ attachmentId: att.id, scanResult: 'clean' }, 'Attachment scanned (clean)');
    } else {
      try {
        await objectStorage.deleteObject(att.objectKey);
      } catch (delErr) {
        logger.warn(
          { attachmentId: att.id, err: delErr instanceof Error ? delErr.message : String(delErr) },
          'Failed to delete infected object (may not exist)',
        );
      }
      await withTransaction(async (tx) => {
        await attachmentRepo.updateStatus(tx, att.id, 'blocked');
      });
      logger.info({ attachmentId: att.id, virus: result.virus, scanResult: 'blocked' }, 'Attachment blocked (infected)');
    }
  } catch (err) {
    await withTransaction(async (tx) => {
      await attachmentRepo.updateStatus(tx, att.id, 'uploaded');
    });
    logger.warn(
      {
        attachmentId: att.id,
        err: err instanceof Error ? err.message : String(err),
        scanResult: 'failed',
      },
      'Scan failed, reverted to uploaded for retry',
    );
  }
}
