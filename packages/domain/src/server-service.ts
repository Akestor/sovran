import { type Server, type MemberRole } from './server';
import { type ServerRepository, type ChannelRepository, type MemberRepository, type ServerInviteRepository } from './server-ports';
import { type OutboxPort, type TokenService } from './ports';
import { canDeleteServer } from './permissions';
import { resolveOwnerTransfer } from './owner-transfer';

export interface ServerServiceDeps {
  serverRepo: ServerRepository;
  channelRepo: ChannelRepository;
  memberRepo: MemberRepository;
  serverInviteRepo: ServerInviteRepository;
  outbox: OutboxPort;
  tokenService: TokenService;
  generateId: () => string;
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
}

export class ServerService {
  constructor(private readonly deps: ServerServiceDeps) {}

  async createServer(ownerId: string, name: string): Promise<Server> {
    const { serverRepo, channelRepo, memberRepo, outbox, generateId } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const serverId = generateId();
      const server = await serverRepo.create(tx, { id: serverId, name, ownerId });

      await memberRepo.add(tx, { serverId, userId: ownerId, role: 'OWNER' });

      const channelId = generateId();
      await channelRepo.create(tx, {
        id: channelId,
        serverId,
        name: 'general',
        type: 'text',
        position: 0,
      });

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: serverId,
        eventType: 'SERVER_MEMBER_JOIN',
        payload: { serverId, userId: ownerId, role: 'OWNER' },
      });

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: serverId,
        eventType: 'CHANNEL_CREATE',
        payload: { serverId, channelId, name: 'general', type: 'text' },
      });

      return server;
    });
  }

  async joinServer(userId: string, inviteCode: string): Promise<{ serverId: string; role: MemberRole }> {
    const { serverRepo, memberRepo, serverInviteRepo, outbox, tokenService } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const codeHash = tokenService.hashRefreshToken(inviteCode);
      const invite = await serverInviteRepo.findByCodeHash(tx, codeHash);

      if (!invite) {
        throw new ServerError('VALIDATION', 'Invalid invite code');
      }
      if (invite.revokedAt) {
        throw new ServerError('VALIDATION', 'Invite code has been revoked');
      }
      if (invite.expiresAt.getTime() <= Date.now()) {
        throw new ServerError('VALIDATION', 'Invite code has expired');
      }
      if (invite.uses >= invite.maxUses) {
        throw new ServerError('VALIDATION', 'Invite code has been fully used');
      }

      const server = await serverRepo.findById(tx, invite.serverId);
      if (!server) {
        throw new ServerError('NOT_FOUND', 'Server not found');
      }

      const existing = await memberRepo.findMember(tx, invite.serverId, userId);
      if (existing) {
        throw new ServerError('CONFLICT', 'Already a member of this server');
      }

      await serverInviteRepo.incrementUses(tx, invite.id);
      await memberRepo.add(tx, { serverId: invite.serverId, userId, role: 'MEMBER' });

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: invite.serverId,
        eventType: 'SERVER_MEMBER_JOIN',
        payload: { serverId: invite.serverId, userId, role: 'MEMBER' },
      });

      return { serverId: invite.serverId, role: 'MEMBER' as MemberRole };
    });
  }

  async leaveServer(userId: string, serverId: string): Promise<void> {
    const { memberRepo, outbox } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new ServerError('NOT_FOUND', 'Not a member of this server');
      }

      if (member.role === 'OWNER') {
        throw new ServerError('VALIDATION', 'Owner cannot leave server. Transfer ownership or delete the server.');
      }

      await memberRepo.remove(tx, serverId, userId);

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: serverId,
        eventType: 'SERVER_MEMBER_LEAVE',
        payload: { serverId, userId },
      });
    });
  }

  async deleteServer(userId: string, serverId: string): Promise<void> {
    const { serverRepo, memberRepo, outbox } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new ServerError('NOT_FOUND', 'Not a member of this server');
      }
      if (!canDeleteServer(member.role)) {
        throw new ServerError('FORBIDDEN', 'Only the server owner can delete the server');
      }

      await serverRepo.softDelete(tx, serverId);

      await outbox.append(tx, {
        aggregateType: 'server',
        aggregateId: serverId,
        eventType: 'SERVER_DELETE',
        payload: { serverId },
      });
    });
  }

  async handleOwnerDeletion(serverId: string, deletedOwnerId: string): Promise<void> {
    const { serverRepo, memberRepo, outbox } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const members = await memberRepo.listByServerId(tx, serverId);
      const result = resolveOwnerTransfer(members, deletedOwnerId);

      if (result.action === 'server_deleted') {
        await serverRepo.softDelete(tx, serverId);
        await outbox.append(tx, {
          aggregateType: 'server',
          aggregateId: serverId,
          eventType: 'SERVER_DELETE',
          payload: { serverId },
        });
      } else if (result.newOwnerId) {
        await serverRepo.updateOwner(tx, serverId, result.newOwnerId);
        await memberRepo.updateRole(tx, serverId, result.newOwnerId, 'OWNER');
        await outbox.append(tx, {
          aggregateType: 'server',
          aggregateId: serverId,
          eventType: 'SERVER_OWNER_TRANSFERRED',
          payload: { serverId, previousOwnerId: deletedOwnerId, newOwnerId: result.newOwnerId },
        });
      }
    });
  }

  async createInvite(
    userId: string,
    serverId: string,
    opts: { maxUses: number; expiresInDays: number },
  ): Promise<{ code: string; expiresAt: Date }> {
    const { memberRepo, serverInviteRepo, tokenService, generateId } = this.deps;

    return this.deps.withTransaction(async (tx) => {
      const member = await memberRepo.findMember(tx, serverId, userId);
      if (!member) {
        throw new ServerError('NOT_FOUND', 'Not a member of this server');
      }

      const code = tokenService.generateRefreshToken();
      const codeHash = tokenService.hashRefreshToken(code);
      const expiresAt = new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000);

      await serverInviteRepo.create(tx, {
        id: generateId(),
        serverId,
        codeHash,
        createdBy: userId,
        expiresAt,
        maxUses: opts.maxUses,
      });

      return { code, expiresAt };
    });
  }

  async listUserServers(userId: string): Promise<Array<{ id: string; name: string; role: MemberRole }>> {
    return this.deps.withTransaction(async (tx) => {
      return this.deps.serverRepo.listByUserId(tx, userId);
    });
  }
}

export class ServerError extends Error {
  constructor(
    public readonly kind: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}
