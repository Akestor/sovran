import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageService, type MessageServiceDeps } from '../message-service';
import { type Message } from '../message';
import { type Channel, type Member } from '../server';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1', channelId: 'ch-1', serverId: 'srv-1', authorId: 'user-1',
    content: 'Hello', editedAt: null, deletedAt: null, createdAt: new Date(),
    ...overrides,
  };
}

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'ch-1', serverId: 'srv-1', name: 'general', type: 'text', position: 0,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    serverId: 'srv-1', userId: 'user-1', role: 'MEMBER', createdAt: new Date(),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<MessageServiceDeps> = {}): MessageServiceDeps {
  let idCounter = 5000;
  return {
    messageRepo: {
      create: vi.fn(async (_tx, m) => makeMessage({ id: m.id, content: m.content, authorId: m.authorId })),
      findById: vi.fn(async () => makeMessage()),
      listByChannel: vi.fn(async () => [makeMessage()]),
      softDelete: vi.fn(async () => {}),
    },
    memberRepo: {
      add: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      findMember: vi.fn(async () => makeMember()),
      listByServerId: vi.fn(async () => []),
      updateRole: vi.fn(async () => {}),
    },
    channelRepo: {
      create: vi.fn(async () => makeChannel()),
      findById: vi.fn(async () => makeChannel()),
      findByServerAndName: vi.fn(async () => null),
      rename: vi.fn(async () => {}),
      softDelete: vi.fn(async () => {}),
      listByServerId: vi.fn(async () => []),
      countByServerId: vi.fn(async () => 1),
    },
    outbox: { append: vi.fn(async () => '999') },
    rateLimiter: { checkSendRate: vi.fn(async () => true) },
    generateId: vi.fn(() => String(idCounter++)),
    withTransaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>) => fn({})),
    ...overrides,
  };
}

describe('MessageService', () => {
  let deps: MessageServiceDeps;
  let service: MessageService;

  beforeEach(() => {
    deps = createMockDeps();
    service = new MessageService(deps);
  });

  describe('sendMessage', () => {
    it('creates message and publishes outbox event', async () => {
      const msg = await service.sendMessage('user-1', 'srv-1', 'ch-1', { content: 'Hello!' });
      expect(msg.content).toBe('Hello!');
      expect(deps.messageRepo.create).toHaveBeenCalledOnce();
      expect(deps.outbox.append).toHaveBeenCalledOnce();

      const outboxCall = (deps.outbox.append as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(outboxCall.eventType).toBe('MESSAGE_CREATE');
      expect(outboxCall.payload.channelId).toBe('ch-1');
      expect(outboxCall.payload.serverId).toBe('srv-1');
    });

    it('includes nonce in outbox event when provided', async () => {
      await service.sendMessage('user-1', 'srv-1', 'ch-1', { content: 'Test', nonce: 'abc' });
      const outboxCall = (deps.outbox.append as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(outboxCall.payload.nonce).toBe('abc');
    });

    it('rejects when rate limited', async () => {
      (deps.rateLimiter.checkSendRate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      await expect(service.sendMessage('user-1', 'srv-1', 'ch-1', { content: 'spam' }))
        .rejects.toMatchObject({ kind: 'RATE_LIMITED' });
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.sendMessage('user-3', 'srv-1', 'ch-1', { content: 'Hello' }))
        .rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });

    it('rejects if channel not found', async () => {
      (deps.channelRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.sendMessage('user-1', 'srv-1', 'ch-99', { content: 'Hello' }))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });

    it('rejects if channel belongs to different server', async () => {
      (deps.channelRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeChannel({ serverId: 'srv-other' }));
      await expect(service.sendMessage('user-1', 'srv-1', 'ch-1', { content: 'Hello' }))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });
  });

  describe('listMessages', () => {
    it('returns messages for member', async () => {
      const messages = await service.listMessages('user-1', 'srv-1', 'ch-1', { limit: 50 });
      expect(messages).toHaveLength(1);
      expect(deps.messageRepo.listByChannel).toHaveBeenCalledWith({}, 'ch-1', { limit: 50 });
    });

    it('passes before cursor', async () => {
      await service.listMessages('user-1', 'srv-1', 'ch-1', { before: 'msg-100', limit: 25 });
      expect(deps.messageRepo.listByChannel).toHaveBeenCalledWith({}, 'ch-1', { before: 'msg-100', limit: 25 });
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.listMessages('user-3', 'srv-1', 'ch-1', { limit: 50 }))
        .rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });

    it('rejects if channel not in server', async () => {
      (deps.channelRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeChannel({ serverId: 'srv-other' }));
      await expect(service.listMessages('user-1', 'srv-1', 'ch-1', { limit: 50 }))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });
  });

  describe('deleteMessage', () => {
    it('author can delete own message', async () => {
      await service.deleteMessage('user-1', 'msg-1');
      expect(deps.messageRepo.softDelete).toHaveBeenCalledWith({}, 'msg-1');
      expect(deps.outbox.append).toHaveBeenCalledOnce();

      const outboxCall = (deps.outbox.append as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(outboxCall.eventType).toBe('MESSAGE_DELETE');
    });

    it('admin can delete any message', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMember({ userId: 'admin-1', role: 'ADMIN' }));
      await service.deleteMessage('admin-1', 'msg-1');
      expect(deps.messageRepo.softDelete).toHaveBeenCalledOnce();
    });

    it('owner can delete any message', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMember({ userId: 'owner-1', role: 'OWNER' }));
      await service.deleteMessage('owner-1', 'msg-1');
      expect(deps.messageRepo.softDelete).toHaveBeenCalledOnce();
    });

    it('member cannot delete others message', async () => {
      (deps.messageRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMessage({ authorId: 'user-other' }));
      await expect(service.deleteMessage('user-1', 'msg-1'))
        .rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });

    it('rejects if message not found', async () => {
      (deps.messageRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.deleteMessage('user-1', 'msg-99'))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });

    it('rejects if message already deleted', async () => {
      (deps.messageRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMessage({ deletedAt: new Date() }));
      await expect(service.deleteMessage('user-1', 'msg-1'))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.deleteMessage('user-3', 'msg-1'))
        .rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });
  });
});
