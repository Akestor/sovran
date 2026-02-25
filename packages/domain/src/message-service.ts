import { type Message } from './message';
import { type MessageRepository } from './message-ports';
import { type MemberRepository, type ChannelRepository } from './server-ports';
import { type OutboxPort } from './ports';
import { type AttachmentRepository, type MessageAttachmentRepository } from './attachment-ports';

export interface MessageRateLimiterPort {
  checkSendRate(userId: string, channelId: string): Promise<boolean>;
}

export interface MessageServiceDeps {
  messageRepo: MessageRepository;
  memberRepo: MemberRepository;
  channelRepo: ChannelRepository;
  attachmentRepo?: AttachmentRepository;
  messageAttachmentRepo?: MessageAttachmentRepository;
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
    input: { content: string; nonce?: string; attachmentIds?: string[] },
  ): Promise<Message & { attachments?: Array<{ id: string; filename: string; contentType: string; sizeBytes: number }> }> {
    const { messageRepo, memberRepo, channelRepo, attachmentRepo, messageAttachmentRepo, outbox, rateLimiter, generateId } = this.deps;

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

      const attachmentIds = input.attachmentIds ?? [];
      let attachmentsMetadata: Array<{ id: string; filename: string; contentType: string; sizeBytes: number }> = [];

      if (attachmentIds.length > 0) {
        if (!attachmentRepo || !messageAttachmentRepo) {
          throw new MessageError('VALIDATION', 'Attachments not supported');
        }
        if (attachmentIds.length > 5) {
          throw new MessageError('VALIDATION', 'Maximum 5 attachments per message');
        }

        const attachments = await attachmentRepo.findByIds(tx, attachmentIds);
        if (attachments.length !== attachmentIds.length) {
          throw new MessageError('VALIDATION', 'One or more attachments not found');
        }

        for (const att of attachments) {
          if (att.status !== 'scanned') {
            throw new MessageError('VALIDATION', 'Attachment not yet available');
          }
          if (att.serverId !== serverId) {
            throw new MessageError('VALIDATION', 'All attachments must belong to this server');
          }
        }

        attachmentsMetadata = attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
        }));
      }

      const messageId = generateId();
      const message = await messageRepo.create(tx, {
        id: messageId,
        channelId,
        serverId,
        authorId: userId,
        content: input.content,
      });

      if (attachmentIds.length > 0 && messageAttachmentRepo) {
        await messageAttachmentRepo.link(tx, messageId, attachmentIds);
      }

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
          ...(attachmentsMetadata.length > 0 ? { attachments: attachmentsMetadata } : {}),
        },
      });

      return attachmentsMetadata.length > 0
        ? { ...message, attachments: attachmentsMetadata }
        : message;
    });
  }

  async listMessages(
    userId: string,
    serverId: string,
    channelId: string,
    opts: { before?: string; limit: number },
  ): Promise<Array<Message & { attachments?: Array<{ id: string; filename: string; contentType: string; sizeBytes: number }> }>> {
    const { messageRepo, memberRepo, channelRepo, messageAttachmentRepo } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new MessageError('FORBIDDEN', 'Not a member of this server');
      }

      const channel = await channelRepo.findById(tx, channelId);
      if (!channel || channel.serverId !== serverId) {
        throw new MessageError('NOT_FOUND', 'Channel not found in this server');
      }

      const messages = await messageRepo.listByChannel(tx, channelId, opts);

      if (messageAttachmentRepo) {
        return Promise.all(
          messages.map(async (msg) => {
            const attachments = await messageAttachmentRepo.listByMessageId(tx, msg.id);
            return {
              ...msg,
              attachments: attachments.map((a) => ({
                id: a.id,
                filename: a.filename,
                contentType: a.contentType,
                sizeBytes: a.sizeBytes,
              })),
            };
          }),
        );
      }

      return messages;
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
