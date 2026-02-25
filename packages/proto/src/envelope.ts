import { z } from 'zod';

export const EventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  timestamp: z.string().datetime(),
  type: z.string().min(1),
  serverId: z.string().optional(),
  channelId: z.string().optional(),
  userId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const ClientMessageSchema = z.object({
  type: z.string().min(1),
  clientMutationId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export function createEnvelope(
  eventId: string,
  type: string,
  opts: {
    serverId?: string;
    channelId?: string;
    userId?: string;
    payload?: Record<string, unknown>;
  } = {},
): EventEnvelope {
  return {
    eventId,
    timestamp: new Date().toISOString(),
    type,
    serverId: opts.serverId,
    channelId: opts.channelId,
    userId: opts.userId,
    payload: opts.payload ?? {},
  };
}
