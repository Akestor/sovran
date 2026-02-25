import { type Attachment } from './attachment';

export interface AttachmentRepository {
  create(
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
  ): Promise<Attachment>;

  findById(tx: unknown, id: string): Promise<Attachment | null>;

  updateStatus(tx: unknown, id: string, status: Attachment['status']): Promise<void>;

  softDelete(tx: unknown, id: string): Promise<void>;

  findByIds(tx: unknown, ids: string[]): Promise<Attachment[]>;

  listByStatus(tx: unknown, status: Attachment['status']): Promise<Attachment[]>;
}

export interface MessageAttachmentRepository {
  link(tx: unknown, messageId: string, attachmentIds: string[]): Promise<void>;

  listByMessageId(tx: unknown, messageId: string): Promise<Attachment[]>;
}

export interface ObjectStoragePort {
  generateUploadUrl(key: string, contentType: string, sizeBytes: number): Promise<string>;

  generateDownloadUrl(key: string): Promise<string>;

  deleteObject(key: string): Promise<void>;

  ensureBucket(): Promise<void>;
}
