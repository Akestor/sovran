export const NatsSubjects = {
  serverEvents: (serverId: string) => `srv.${serverId}.events`,

  channelEvents: (serverId: string, channelId: string) =>
    `srv.${serverId}.chan.${channelId}.events`,

  serverChannelWildcard: (serverId: string) => `srv.${serverId}.chan.*.events`,

  channelTyping: (serverId: string, channelId: string) =>
    `srv.${serverId}.chan.${channelId}.typing`,

  serverChannelTypingWildcard: (serverId: string) => `srv.${serverId}.chan.*.typing`,

  serverPresence: (serverId: string) => `srv.${serverId}.presence`,

  userEvents: (userId: string) => `user.${userId}.events`,

  userDmEvents: (userId: string) => `user.${userId}.dm.events`,

  allServerEvents: 'srv.>',
} as const;

export type AggregateType = 'channel' | 'server' | 'user';

const CHANNEL_SCOPED_EVENTS = new Set([
  'MESSAGE_CREATE',
  'MESSAGE_UPDATE',
  'MESSAGE_DELETE',
  'CHANNEL_CREATE',
  'CHANNEL_DELETE',
  'CHANNEL_RENAME',
]);

const PRESENCE_EVENTS = new Set([
  'PRESENCE_UPDATE',
]);

export function resolveOutboxSubject(
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  meta?: { serverId?: string; channelId?: string; userId?: string },
): string {
  if (meta?.serverId && meta?.channelId && CHANNEL_SCOPED_EVENTS.has(eventType)) {
    return NatsSubjects.channelEvents(meta.serverId, meta.channelId);
  }

  if (meta?.serverId && PRESENCE_EVENTS.has(eventType)) {
    return NatsSubjects.serverPresence(meta.serverId);
  }

  if (aggregateType === 'server' && meta?.serverId) {
    return NatsSubjects.serverEvents(meta.serverId);
  }

  if (aggregateType === 'user' && meta?.userId) {
    return NatsSubjects.userEvents(meta.userId);
  }

  return `${aggregateType}.${aggregateId}.${eventType}`;
}
