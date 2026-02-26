export type AttachmentStatus = 'pending' | 'uploaded' | 'scanning' | 'scanned' | 'blocked' | 'deleted';

export interface Attachment {
  id: string;
  serverId: string;
  channelId: string;
  uploaderId: string | null;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  createdAt: Date;
  deletedAt: Date | null;
}
