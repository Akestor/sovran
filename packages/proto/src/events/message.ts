import { z } from 'zod';

export const MESSAGE_CREATE = 'MESSAGE_CREATE' as const;
export const MESSAGE_UPDATE = 'MESSAGE_UPDATE' as const;
export const MESSAGE_DELETE = 'MESSAGE_DELETE' as const;

export const MessageAttachmentPayloadSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
});

export const MessageCreatePayload = z.object({
  messageId: z.string(),
  channelId: z.string(),
  serverId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  nonce: z.string().optional(),
  attachments: z.array(MessageAttachmentPayloadSchema).optional(),
});

export const MessageUpdatePayload = z.object({
  messageId: z.string(),
  channelId: z.string(),
  serverId: z.string(),
  content: z.string(),
  editedAt: z.string(),
});

export const MessageDeletePayload = z.object({
  messageId: z.string(),
  channelId: z.string(),
  serverId: z.string(),
});

export type MessageAttachmentPayload = z.infer<typeof MessageAttachmentPayloadSchema>;
export type MessageCreate = z.infer<typeof MessageCreatePayload>;
export type MessageUpdate = z.infer<typeof MessageUpdatePayload>;
export type MessageDelete = z.infer<typeof MessageDeletePayload>;
