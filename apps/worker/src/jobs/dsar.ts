import { createLogger } from '@sovran/shared';
import { withTransaction, PgAttachmentRepository } from '@sovran/db';

const logger = createLogger({ name: 'worker:dsar' });
const attachmentRepo = new PgAttachmentRepository();

export interface DsarAttachmentMetadata {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  serverId: string;
  channelId: string;
  messageId: string | null;
}

/** Collect attachment metadata for DSAR export. No object_key, no download URLs. */
export async function collectAttachmentMetadataForUser(userId: string): Promise<DsarAttachmentMetadata[]> {
  return withTransaction(async (tx) => {
    const rows = await attachmentRepo.listDsarMetadataByUploaderId(tx, userId);
    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt.toISOString(),
      serverId: r.serverId,
      channelId: r.channelId,
      messageId: r.messageId,
    }));
  });
}

export async function runDsarExportJob(): Promise<void> {
  logger.info({}, 'DSAR export job started');
  // Placeholder: generates data subject access request exports (Art. 15/20 GDPR)
  // 1. Fetch pending DSAR requests from DB (dsar_requests table)
  // 2. Collect all user data across tables (per DSAR field mapping)
  //    - attachments: collectAttachmentMetadataForUser(userId)
  // 3. Package into portable format (JSON archive)
  // 4. Store export in object storage with time-limited access
  // 5. Notify user that export is ready
  // 6. Mark DSAR request as completed
  logger.info({}, 'DSAR export completed (skeleton)');
}
