import { createLogger } from '@sovran/shared';
import { withTransaction, PgAttachmentRepository } from '@sovran/db';

const logger = createLogger({ name: 'worker:attachment-scan' });
const attachmentRepo = new PgAttachmentRepository();

export async function runAttachmentScanJob(): Promise<void> {
  await withTransaction(async (tx) => {
    const uploaded = await attachmentRepo.listByStatus(tx, 'uploaded');

    for (const att of uploaded) {
      await attachmentRepo.updateStatus(tx, att.id, 'scanned');
      logger.info({ attachmentId: att.id }, 'Attachment marked as scanned (stub)');
    }

    if (uploaded.length > 0) {
      logger.info({ count: uploaded.length }, 'Attachment scan batch processed');
    }
  });
}
