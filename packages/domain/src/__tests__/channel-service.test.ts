import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelService, type ChannelServiceDeps } from '../channel-service';
import { type Channel, type Member } from '../server';

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'ch-1', serverId: 'srv-1', name: 'general', type: 'text', position: 0,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    serverId: 'srv-1', userId: 'user-1', role: 'ADMIN', createdAt: new Date(),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<ChannelServiceDeps> = {}): ChannelServiceDeps {
  let idCounter = 2000;
  return {
    channelRepo: {
      create: vi.fn(async (_tx, c) => makeChannel({ id: c.id, serverId: c.serverId, name: c.name })),
      findById: vi.fn(async () => makeChannel()),
      findByServerAndName: vi.fn(async () => null),
      rename: vi.fn(async () => {}),
      softDelete: vi.fn(async () => {}),
      listByServerId: vi.fn(async () => [makeChannel()]),
      countByServerId: vi.fn(async () => 1),
    },
    memberRepo: {
      add: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      findMember: vi.fn(async () => makeMember()),
      listByServerId: vi.fn(async () => []),
      updateRole: vi.fn(async () => {}),
    },
    outbox: { append: vi.fn(async () => '999') },
    generateId: vi.fn(() => String(idCounter++)),
    withTransaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>) => fn({})),
    maxChannelsPerServer: 200,
    ...overrides,
  };
}

describe('ChannelService', () => {
  let deps: ChannelServiceDeps;
  let service: ChannelService;

  beforeEach(() => {
    deps = createMockDeps();
    service = new ChannelService(deps);
  });

  describe('createChannel', () => {
    it('creates channel successfully', async () => {
      const channel = await service.createChannel('user-1', 'srv-1', { name: 'dev-talk' });
      expect(channel.name).toBe('dev-talk');
      expect(deps.channelRepo.create).toHaveBeenCalledOnce();
      expect(deps.outbox.append).toHaveBeenCalledOnce();
    });

    it('rejects when at channel limit', async () => {
      (deps.channelRepo.countByServerId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(200);
      await expect(service.createChannel('user-1', 'srv-1', { name: 'new' }))
        .rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('rejects MEMBER role', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMember({ role: 'MEMBER' }));
      await expect(service.createChannel('user-2', 'srv-1', { name: 'new' }))
        .rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });

    it('rejects duplicate channel name', async () => {
      (deps.channelRepo.findByServerAndName as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeChannel());
      await expect(service.createChannel('user-1', 'srv-1', { name: 'general' }))
        .rejects.toMatchObject({ kind: 'CONFLICT' });
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.createChannel('user-3', 'srv-1', { name: 'new' }))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });
  });

  describe('renameChannel', () => {
    it('renames successfully', async () => {
      await service.renameChannel('user-1', 'ch-1', 'new-name');
      expect(deps.channelRepo.rename).toHaveBeenCalledWith({}, 'ch-1', 'new-name');
      expect(deps.outbox.append).toHaveBeenCalledOnce();
    });

    it('rejects MEMBER role', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMember({ role: 'MEMBER' }));
      await expect(service.renameChannel('user-2', 'ch-1', 'new-name'))
        .rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });

    it('rejects if name conflicts', async () => {
      (deps.channelRepo.findByServerAndName as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeChannel({ id: 'ch-2' }));
      await expect(service.renameChannel('user-1', 'ch-1', 'taken-name'))
        .rejects.toMatchObject({ kind: 'CONFLICT' });
    });

    it('allows renaming to same name (no-op)', async () => {
      (deps.channelRepo.findByServerAndName as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeChannel({ id: 'ch-1' }));
      await service.renameChannel('user-1', 'ch-1', 'general');
      expect(deps.channelRepo.rename).toHaveBeenCalledOnce();
    });
  });

  describe('deleteChannel', () => {
    it('deletes successfully', async () => {
      await service.deleteChannel('user-1', 'ch-1');
      expect(deps.channelRepo.softDelete).toHaveBeenCalledWith({}, 'ch-1');
      expect(deps.outbox.append).toHaveBeenCalledOnce();
    });

    it('rejects MEMBER role', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMember({ role: 'MEMBER' }));
      await expect(service.deleteChannel('user-2', 'ch-1'))
        .rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });

    it('rejects non-existent channel', async () => {
      (deps.channelRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.deleteChannel('user-1', 'ch-99'))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });
  });

  describe('listChannels', () => {
    it('returns channels for member', async () => {
      const channels = await service.listChannels('user-1', 'srv-1');
      expect(channels).toHaveLength(1);
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.listChannels('user-3', 'srv-1'))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });
  });
});
