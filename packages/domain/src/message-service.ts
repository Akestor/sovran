import { type Message } from './message';
import { type MessageRepository } from './message-ports';
import { type MemberRepository, type ChannelRepository } from './server-ports';
import { type OutboxPort } from './ports';

export interface MessageRateLimiterPort {
  checkSendRate(userId: string, channelId: string): Promise<boolean>;
}

export interface MessageServiceDeps {
  messageRepo: MessageRepository;
  memberRepo: MemberRepository;
  channelRepo: ChannelRepository;
  outbox: OutboxPort;
  rateLimiter: MessageRateLimiterPort;
  generateId: () => string;
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
}

export class MessageService {
  constructor(private readonly deps: MessageServiceDeps) {}

  async sendMessage(
    userId: string,
    serverId: string,
    channelId: string,
    input: { content: string; nonce?: string },
  ): Promise<Message> {
    const { messageRepo, memberRepo, channelRepo, outbox, rateLimiter, generateId } = this.deps;

    const allowed = await rateLimiter.checkSendRate(userId, channelId);
    if (!allowed) {
      throw new MessageError('RATE_LIMITED', 'Too many messages, slow down');
    }

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new MessageError('FORBIDDEN', 'Not a member of this server');
      }

      const channel = await channelRepo.findById(tx, channelId);
      if (!channel || channel.serverId !== serverId) {
        throw new MessageError('NOT_FOUND', 'Channel not found in this server');
      }

      const messageId = generateId();
      const message = await messageRepo.create(tx, {
        id: messageId,
        channelId,
        serverId,
        authorId: userId,
        content: input.content,
      });

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: serverId,
        eventType: 'MESSAGE_CREATE',
        payload: {
          messageId,
          channelId,
          serverId,
          authorId: userId,
          content: input.content,
          createdAt: message.createdAt.toISOString(),
          ...(input.nonce ? { nonce: input.nonce } : {}),
        },
      });

      return message;
    });
  }

  async listMessages(
    userId: string,
    serverId: string,
    channelId: string,
    opts: { before?: string; limit: number },
  ): Promise<Message[]> {
    const { messageRepo, memberRepo, channelRepo } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new MessageError('FORBIDDEN', 'Not a member of this server');
      }

      const channel = await channelRepo.findById(tx, channelId);
      if (!channel || channel.serverId !== serverId) {
        throw new MessageError('NOT_FOUND', 'Channel not found in this server');
      }

      return messageRepo.listByChannel(tx, channelId, opts);
    });
  }

  async deleteMessage(userId: string, messageId: string): Promise<void> {
    const { messageRepo, memberRepo, outbox } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const message = await messageRepo.findById(tx, messageId);
      if (!message || message.deletedAt) {
        throw new MessageError('NOT_FOUND', 'Message not found');
      }

      const member = await memberRepo.findMember(tx, message.serverId, userId);
      if (!member) {
        throw new MessageError('FORBIDDEN', 'Not a member of this server');
      }

      const isAuthor = message.authorId === userId;
      const isAdmin = member.role === 'OWNER' || member.role === 'ADMIN';
      if (!isAuthor && !isAdmin) {
        throw new MessageError('FORBIDDEN', 'Cannot delete this message');
      }

      await messageRepo.softDelete(tx, messageId);

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: message.serverId,
        eventType: 'MESSAGE_DELETE',
        payload: {
          messageId,
          channelId: message.channelId,
          serverId: message.serverId,
        },
      });
    });
  }
}

export class MessageError extends Error {
  constructor(
    public readonly kind: 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'RATE_LIMITED',
    message: string,
  ) {
    super(message);
    this.name = 'MessageError';
  }
}
