import { z } from 'zod';

export const MESSAGE_CREATE = 'MESSAGE_CREATE' as const;
export const MESSAGE_UPDATE = 'MESSAGE_UPDATE' as const;
export const MESSAGE_DELETE = 'MESSAGE_DELETE' as const;

export const MessageCreatePayload = z.object({
  messageId: z.string(),
  channelId: z.string(),
  serverId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  nonce: z.string().optional(),
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

export type MessageCreate = z.infer<typeof MessageCreatePayload>;
export type MessageUpdate = z.infer<typeof MessageUpdatePayload>;
export type MessageDelete = z.infer<typeof MessageDeletePayload>;
