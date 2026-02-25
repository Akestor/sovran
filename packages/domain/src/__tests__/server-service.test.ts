import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServerService, type ServerServiceDeps } from '../server-service';
import { type Server, type Member, type ServerInvite } from '../server';

function makeServer(overrides: Partial<Server> = {}): Server {
  return {
    id: 'srv-1', name: 'Test Server', ownerId: 'user-1',
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    serverId: 'srv-1', userId: 'user-1', role: 'OWNER', createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeInvite(overrides: Partial<ServerInvite> = {}): ServerInvite {
  return {
    id: 'inv-1', serverId: 'srv-1', codeHash: 'sha256:code', createdBy: 'user-1',
    expiresAt: new Date(Date.now() + 86_400_000), maxUses: 25, uses: 0,
    revokedAt: null, createdAt: new Date(),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<ServerServiceDeps> = {}): ServerServiceDeps {
  let idCounter = 1000;
  return {
    serverRepo: {
      create: vi.fn(async (_tx, s) => makeServer({ id: s.id, name: s.name, ownerId: s.ownerId })),
      findById: vi.fn(async () => makeServer()),
      updateOwner: vi.fn(async () => {}),
      softDelete: vi.fn(async () => {}),
      listByUserId: vi.fn(async () => []),
    },
    channelRepo: {
      create: vi.fn(async (_tx, c) => ({ id: c.id, serverId: c.serverId, name: c.name, type: c.type, position: c.position, createdAt: new Date(), updatedAt: new Date(), deletedAt: null })),
      findById: vi.fn(async () => null),
      findByServerAndName: vi.fn(async () => null),
      rename: vi.fn(async () => {}),
      softDelete: vi.fn(async () => {}),
      listByServerId: vi.fn(async () => []),
      countByServerId: vi.fn(async () => 0),
    },
    memberRepo: {
      add: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      findMember: vi.fn(async () => makeMember()),
      listByServerId: vi.fn(async () => [makeMember()]),
      updateRole: vi.fn(async () => {}),
    },
    serverInviteRepo: {
      create: vi.fn(async () => {}),
      findByCodeHash: vi.fn(async () => makeInvite()),
      incrementUses: vi.fn(async () => {}),
      revoke: vi.fn(async () => {}),
    },
    outbox: { append: vi.fn(async () => '999') },
    tokenService: {
      signAccessToken: vi.fn(async () => 'token'),
      verifyAccessToken: vi.fn(async () => ({ userId: 'user-1' })),
      generateRefreshToken: vi.fn(() => 'raw-code'),
      hashRefreshToken: vi.fn((t: string) => `sha256:${t}`),
    },
    generateId: vi.fn(() => String(idCounter++)),
    withTransaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>) => fn({})),
    ...overrides,
  };
}

describe('ServerService', () => {
  let deps: ServerServiceDeps;
  let service: ServerService;

  beforeEach(() => {
    deps = createMockDeps();
    service = new ServerService(deps);
  });

  describe('createServer', () => {
    it('creates server with owner membership and #general channel', async () => {
      const server = await service.createServer('user-1', 'My Server');
      expect(server.name).toBe('My Server');
      expect(deps.serverRepo.create).toHaveBeenCalledOnce();
      expect(deps.memberRepo.add).toHaveBeenCalledOnce();
      expect(deps.channelRepo.create).toHaveBeenCalledOnce();
      expect(deps.outbox.append).toHaveBeenCalledTimes(2);
    });
  });

  describe('joinServer', () => {
    it('joins with valid invite code', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const result = await service.joinServer('user-2', 'valid-code');
      expect(result.serverId).toBe('srv-1');
      expect(result.role).toBe('MEMBER');
      expect(deps.serverInviteRepo.incrementUses).toHaveBeenCalledOnce();
      expect(deps.memberRepo.add).toHaveBeenCalledOnce();
    });

    it('rejects invalid invite code', async () => {
      (deps.serverInviteRepo.findByCodeHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.joinServer('user-2', 'bad-code')).rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('rejects expired invite', async () => {
      (deps.serverInviteRepo.findByCodeHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeInvite({ expiresAt: new Date('2020-01-01') }),
      );
      await expect(service.joinServer('user-2', 'expired')).rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('rejects revoked invite', async () => {
      (deps.serverInviteRepo.findByCodeHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeInvite({ revokedAt: new Date() }),
      );
      await expect(service.joinServer('user-2', 'revoked')).rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('rejects fully used invite', async () => {
      (deps.serverInviteRepo.findByCodeHash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeInvite({ uses: 25, maxUses: 25 }),
      );
      await expect(service.joinServer('user-2', 'used-up')).rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('rejects if already a member', async () => {
      await expect(service.joinServer('user-1', 'code')).rejects.toMatchObject({ kind: 'CONFLICT' });
    });
  });

  describe('leaveServer', () => {
    it('leaves server successfully', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMember({ role: 'MEMBER' }));
      await service.leaveServer('user-2', 'srv-1');
      expect(deps.memberRepo.remove).toHaveBeenCalledOnce();
      expect(deps.outbox.append).toHaveBeenCalledOnce();
    });

    it('owner cannot leave', async () => {
      await expect(service.leaveServer('user-1', 'srv-1')).rejects.toMatchObject({ kind: 'VALIDATION' });
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.leaveServer('user-3', 'srv-1')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });
  });

  describe('deleteServer', () => {
    it('owner can delete', async () => {
      await service.deleteServer('user-1', 'srv-1');
      expect(deps.serverRepo.softDelete).toHaveBeenCalledOnce();
      expect(deps.outbox.append).toHaveBeenCalledOnce();
    });

    it('non-owner cannot delete', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeMember({ role: 'ADMIN' }));
      await expect(service.deleteServer('user-2', 'srv-1')).rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });
  });

  describe('handleOwnerDeletion', () => {
    it('transfers to oldest admin', async () => {
      (deps.memberRepo.listByServerId as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeMember({ userId: 'owner-1', role: 'OWNER', createdAt: new Date('2026-01-01') }),
        makeMember({ userId: 'admin-1', role: 'ADMIN', createdAt: new Date('2026-01-02') }),
      ]);

      await service.handleOwnerDeletion('srv-1', 'owner-1');
      expect(deps.serverRepo.updateOwner).toHaveBeenCalledWith({}, 'srv-1', 'admin-1');
      expect(deps.memberRepo.updateRole).toHaveBeenCalledWith({}, 'srv-1', 'admin-1', 'OWNER');
    });

    it('deletes server when no other members', async () => {
      (deps.memberRepo.listByServerId as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeMember({ userId: 'owner-1', role: 'OWNER' }),
      ]);

      await service.handleOwnerDeletion('srv-1', 'owner-1');
      expect(deps.serverRepo.softDelete).toHaveBeenCalledOnce();
    });
  });

  describe('createInvite', () => {
    it('creates an invite and returns code', async () => {
      const result = await service.createInvite('user-1', 'srv-1', { maxUses: 10, expiresInDays: 7 });
      expect(result.code).toBe('raw-code');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(deps.serverInviteRepo.create).toHaveBeenCalledOnce();
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.createInvite('user-3', 'srv-1', { maxUses: 10, expiresInDays: 7 }))
        .rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });
  });
});
