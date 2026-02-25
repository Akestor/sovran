export const NatsSubjects = {
  serverEvents: (serverId: string) => `srv.${serverId}.events`,

  channelEvents: (serverId: string, channelId: string) =>
    `srv.${serverId}.chan.${channelId}.events`,

  serverChannelWildcard: (serverId: string) => `srv.${serverId}.chan.*.events`,

  serverPresence: (serverId: string) => `srv.${serverId}.presence`,

  userEvents: (userId: string) => `user.${userId}.events`,

  userDmEvents: (userId: string) => `user.${userId}.dm.events`,

  allServerEvents: 'srv.>',
} as const;

export type AggregateType = 'channel' | 'server' | 'user';

export function resolveOutboxSubject(
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  meta?: { serverId?: string; channelId?: string; userId?: string },
): string {
  switch (aggregateType) {
    case 'channel':
      if (meta?.serverId && meta?.channelId) {
        return NatsSubjects.channelEvents(meta.serverId, meta.channelId);
      }
      break;
    case 'server':
      if (meta?.serverId) {
        return NatsSubjects.serverPresence(meta.serverId);
      }
      break;
    case 'user':
      if (meta?.userId) {
        return NatsSubjects.userEvents(meta.userId);
      }
      break;
  }
  return `${aggregateType}.${aggregateId}.${eventType}`;
}
