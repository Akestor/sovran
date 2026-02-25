import { type Channel } from './server';
import { type ChannelRepository, type MemberRepository } from './server-ports';
import { type OutboxPort } from './ports';
import { canCreateChannel, canDeleteChannel, canRenameChannel, canCreateChannelWithLimit } from './permissions';

export interface ChannelServiceDeps {
  channelRepo: ChannelRepository;
  memberRepo: MemberRepository;
  outbox: OutboxPort;
  generateId: () => string;
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  maxChannelsPerServer: number;
}

export class ChannelService {
  constructor(private readonly deps: ChannelServiceDeps) {}

  async createChannel(
    userId: string,
    serverId: string,
    input: { name: string; type?: string },
  ): Promise<Channel> {
    const { channelRepo, memberRepo, outbox, generateId } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new ChannelError('NOT_FOUND', 'Not a member of this server');
      }

      const count = await channelRepo.countByServerId(tx, serverId);
      if (!canCreateChannelWithLimit(count, member.role, this.deps.maxChannelsPerServer)) {
        if (!canCreateChannel(member.role)) {
          throw new ChannelError('FORBIDDEN', 'Insufficient permissions to create a channel');
        }
        throw new ChannelError('VALIDATION', 'Channel limit reached for this server');
      }

      const existing = await channelRepo.findByServerAndName(tx, serverId, input.name);
      if (existing) {
        throw new ChannelError('CONFLICT', 'A channel with this name already exists');
      }

      const channelId = generateId();
      const type = input.type ?? 'text';
      const channel = await channelRepo.create(tx, {
        id: channelId,
        serverId,
        name: input.name,
        type,
        position: count,
      });

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: serverId,
        eventType: 'CHANNEL_CREATE',
        payload: { serverId, channelId, name: input.name, type },
      });

      return channel;
    });
  }

  async renameChannel(userId: string, channelId: string, newName: string): Promise<void> {
    const { channelRepo, memberRepo, outbox } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const channel = await channelRepo.findById(tx, channelId);
      if (!channel) {
        throw new ChannelError('NOT_FOUND', 'Channel not found');
      }

      const member = await memberRepo.findMember(tx, channel.serverId, userId);
      if (!member) {
        throw new ChannelError('NOT_FOUND', 'Not a member of this server');
      }
      if (!canRenameChannel(member.role)) {
        throw new ChannelError('FORBIDDEN', 'Insufficient permissions to rename this channel');
      }

      const existing = await channelRepo.findByServerAndName(tx, channel.serverId, newName);
      if (existing && existing.id !== channelId) {
        throw new ChannelError('CONFLICT', 'A channel with this name already exists');
      }

      await channelRepo.rename(tx, channelId, newName);

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: channel.serverId,
        eventType: 'CHANNEL_RENAME',
        payload: { serverId: channel.serverId, channelId, name: newName },
      });
    });
  }

  async deleteChannel(userId: string, channelId: string): Promise<void> {
    const { channelRepo, memberRepo, outbox } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const channel = await channelRepo.findById(tx, channelId);
      if (!channel) {
        throw new ChannelError('NOT_FOUND', 'Channel not found');
      }

      const member = await memberRepo.findMember(tx, channel.serverId, userId);
      if (!member) {
        throw new ChannelError('NOT_FOUND', 'Not a member of this server');
      }
      if (!canDeleteChannel(member.role)) {
        throw new ChannelError('FORBIDDEN', 'Insufficient permissions to delete this channel');
      }

      await channelRepo.softDelete(tx, channelId);

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: channel.serverId,
        eventType: 'CHANNEL_DELETE',
        payload: { serverId: channel.serverId, channelId },
      });
    });
  }

  async listChannels(userId: string, serverId: string): Promise<Channel[]> {
    const { channelRepo, memberRepo } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new ChannelError('NOT_FOUND', 'Not a member of this server');
      }
      return channelRepo.listByServerId(tx, serverId);
    });
  }
}

export class ChannelError extends Error {
  constructor(
    public readonly kind: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'ChannelError';
  }
}
