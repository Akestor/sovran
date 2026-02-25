import { type FastifyInstance } from 'fastify';
import { AppError, ErrorCode, type PresenceStore } from '@sovran/shared';
import { type MemberRepository } from '@sovran/domain';
import { type createAuthMiddleware } from '../plugins/auth';

interface PresenceRouteDeps {
  presenceStore: PresenceStore;
  memberRepo: MemberRepository;
  authenticate: ReturnType<typeof createAuthMiddleware>;
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
}

export function registerPresenceRoutes(app: FastifyInstance, deps: PresenceRouteDeps): void {
  const { presenceStore, memberRepo, authenticate, withTransaction } = deps;

  app.get('/servers/:serverId/presence', { preHandler: [authenticate] }, async (request, reply) => {
    const { serverId } = request.params as { serverId: string };
    const userId = request.userId!;

    const member = await withTransaction((tx) => memberRepo.findMember(tx, serverId, userId));
    if (!member) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not a member of this server');
    }

    const members = await withTransaction((tx) => memberRepo.listByServerId(tx, serverId));
    const memberUserIds = members.map((m) => m.userId);
    const onlineIds = await presenceStore.getOnlineMembers(memberUserIds);

    const presenceList = await Promise.all(
      onlineIds.map(async (uid) => {
        const p = await presenceStore.getPresence(uid);
        return { userId: uid, status: p?.status ?? 'online' };
      }),
    );

    return reply.status(200).send(presenceList);
  });
}
