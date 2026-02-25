import { z } from 'zod';
import { MAX_ATTACHMENTS_PER_MESSAGE } from './attachment';

export const MESSAGE_CONTENT_MAX_LENGTH = 4000;

export const SendMessageRequestSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message content is required')
    .max(MESSAGE_CONTENT_MAX_LENGTH, `Message must be at most ${MESSAGE_CONTENT_MAX_LENGTH} characters`),
  nonce: z.string().max(64).optional(),
  attachmentIds: z.array(z.string()).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
});

export const AttachmentResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
});

export const MessageResponseSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  serverId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  attachments: z.array(AttachmentResponseSchema).optional(),
});

export const ListMessagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
