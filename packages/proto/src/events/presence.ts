import { z } from 'zod';

export const PRESENCE_UPDATE = 'PRESENCE_UPDATE' as const;
export const TYPING_START = 'TYPING_START' as const;

export const PresenceUpdatePayload = z.object({
  userId: z.string(),
  serverId: z.string(),
  status: z.enum(['online', 'idle', 'dnd', 'offline']),
});

export const TypingStartPayload = z.object({
  userId: z.string(),
  channelId: z.string(),
  serverId: z.string(),
});

export type PresenceUpdate = z.infer<typeof PresenceUpdatePayload>;
export type TypingStart = z.infer<typeof TypingStartPayload>;
