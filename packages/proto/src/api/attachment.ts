import { z } from 'zod';

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const;

export const InitAttachmentRequestSchema = z.object({
  filename: z.string().trim().min(1, 'Filename is required').max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  sizeBytes: z.coerce.number().int().min(1).max(MAX_ATTACHMENT_SIZE),
});

export const CompleteAttachmentRequestSchema = z.object({});

export const AttachmentMetadataSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
});

export type InitAttachmentRequest = z.infer<typeof InitAttachmentRequestSchema>;
export type CompleteAttachmentRequest = z.infer<typeof CompleteAttachmentRequestSchema>;
export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>;
