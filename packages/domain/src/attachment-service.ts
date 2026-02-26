import type {
  AttachmentRepository,
  MessageAttachmentRepository,
  ObjectStoragePort,
} from './attachment-ports';
import type { MemberRepository, ChannelRepository } from './server-ports';
import type { OutboxPort } from './ports';

export interface AttachmentServiceDeps {
  attachmentRepo: AttachmentRepository;
  messageAttachmentRepo: MessageAttachmentRepository;
  memberRepo: MemberRepository;
  channelRepo: ChannelRepository;
  objectStorage: ObjectStoragePort;
  outbox: OutboxPort;
  generateId: () => string;
  generateUuid: () => string;
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
}

export class AttachmentService {
  constructor(private readonly deps: AttachmentServiceDeps) {}

  async initUpload(
    userId: string,
    serverId: string,
    channelId: string,
    input: { filename: string; contentType: string; sizeBytes: number },
  ): Promise<{ attachmentId: string; uploadUrl: string }> {
    const { attachmentRepo, memberRepo, channelRepo, objectStorage, generateId } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new AttachmentError('FORBIDDEN', 'Not a member of this server');
      }

      const channel = await channelRepo.findById(tx, channelId);
      if (!channel || channel.serverId !== serverId) {
        throw new AttachmentError('NOT_FOUND', 'Channel not found in this server');
      }

      const attachmentId = generateId();
      const sanitizedFilename = sanitizeFilename(input.filename);
      const objectKey = `srv/${serverId}/${this.deps.generateUuid()}/${sanitizedFilename}`;

      const attachment = await attachmentRepo.create(tx, {
        id: attachmentId,
        serverId,
        channelId,
        uploaderId: userId,
        objectKey,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });

      const uploadUrl = await objectStorage.generateUploadUrl(
        attachment.objectKey,
        attachment.contentType,
        attachment.sizeBytes,
      );

      return { attachmentId, uploadUrl };
    });
  }

  async completeUpload(userId: string, attachmentId: string): Promise<void> {
    const { attachmentRepo, outbox } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const attachment = await attachmentRepo.findById(tx, attachmentId);
      if (!attachment) {
        throw new AttachmentError('UPLOAD_NOT_FOUND', 'Attachment not found');
      }
      if (attachment.uploaderId !== userId) {
        throw new AttachmentError('FORBIDDEN', 'Not the uploader of this attachment');
      }
      if (attachment.status !== 'pending') {
        throw new AttachmentError('VALIDATION', 'Attachment already completed or invalid');
      }

      await attachmentRepo.updateStatus(tx, attachmentId, 'uploaded');

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: attachment.serverId,
        eventType: 'ATTACHMENT_UPLOADED',
        payload: {
          attachmentId,
          serverId: attachment.serverId,
          channelId: attachment.channelId,
          objectKey: attachment.objectKey,
        },
      });
    });
  }

  async getDownloadUrl(userId: string, attachmentId: string): Promise<string> {
    const { attachmentRepo, memberRepo, objectStorage } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const attachment = await attachmentRepo.findById(tx, attachmentId);
      if (!attachment) {
        throw new AttachmentError('UPLOAD_NOT_FOUND', 'Attachment not found');
      }

      const member = await memberRepo.findMember(tx, attachment.serverId, userId);
      if (!member) {
        throw new AttachmentError('FORBIDDEN', 'Not a member of this server');
      }

      if (attachment.status === 'blocked') {
        throw new AttachmentError('SCAN_FAILED', 'Attachment was blocked by security scan');
      }
      if (attachment.status !== 'scanned') {
        throw new AttachmentError('SCAN_FAILED', 'Attachment not yet available for download');
      }

      return objectStorage.generateDownloadUrl(attachment.objectKey);
    });
  }
}

export class AttachmentError extends Error {
  constructor(
    public readonly kind: 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'STORAGE_UNAVAILABLE' | 'SCAN_FAILED' | 'UPLOAD_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AttachmentError';
  }
}

function sanitizeFilename(filename: string): string {
  const basename = filename.replace(/^.*[/\\]/, '');
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
}
