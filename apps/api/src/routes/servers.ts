import { type FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from '@sovran/shared';
import { ServerError, type ServerService } from '@sovran/domain';
import {
  CreateServerRequestSchema,
  CreateServerInviteRequestSchema,
  JoinServerRequestSchema,
} from '@sovran/proto';
import { type createAuthMiddleware } from '../plugins/auth';

interface ServerRouteDeps {
  serverService: ServerService;
  authenticate: ReturnType<typeof createAuthMiddleware>;
}

function mapServerError(err: unknown): never {
  if (err instanceof ServerError) {
    const codeMap: Record<string, ErrorCode> = {
      VALIDATION: ErrorCode.VALIDATION,
      NOT_FOUND: ErrorCode.NOT_FOUND,
      CONFLICT: ErrorCode.CONFLICT,
      FORBIDDEN: ErrorCode.FORBIDDEN,
    };
    throw new AppError(codeMap[err.kind] ?? ErrorCode.INTERNAL, err.message);
  }
  throw err;
}

export function registerServerRoutes(app: FastifyInstance, deps: ServerRouteDeps): void {
  const { serverService, authenticate } = deps;

  app.post('/servers', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = CreateServerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid server data', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const server = await serverService.createServer(request.userId!, parsed.data.name);
      return reply.status(201).send({
        id: server.id,
        name: server.name,
        ownerId: server.ownerId,
        createdAt: server.createdAt.toISOString(),
      });
    } catch (err) {
      return mapServerError(err);
    }
  });

  app.get('/servers', { preHandler: [authenticate] }, async (request, reply) => {
    const servers = await serverService.listUserServers(request.userId!);
    return reply.status(200).send(servers);
  });

  app.delete('/servers/:serverId', { preHandler: [authenticate] }, async (request, reply) => {
    const { serverId } = request.params as { serverId: string };

    try {
      await serverService.deleteServer(request.userId!, serverId);
      return reply.status(204).send();
    } catch (err) {
      return mapServerError(err);
    }
  });

  app.post('/servers/:serverId/invites', { preHandler: [authenticate] }, async (request, reply) => {
    const { serverId } = request.params as { serverId: string };
    const parsed = CreateServerInviteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid invite data', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const invite = await serverService.createInvite(request.userId!, serverId, parsed.data);
      return reply.status(201).send({
        code: invite.code,
        expiresAt: invite.expiresAt.toISOString(),
      });
    } catch (err) {
      return mapServerError(err);
    }
  });

  app.post('/servers/join', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = JoinServerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid join request');
    }

    try {
      const result = await serverService.joinServer(request.userId!, parsed.data.inviteCode);
      return reply.status(200).send(result);
    } catch (err) {
      return mapServerError(err);
    }
  });

  app.post('/servers/:serverId/leave', { preHandler: [authenticate] }, async (request, reply) => {
    const { serverId } = request.params as { serverId: string };

    try {
      await serverService.leaveServer(request.userId!, serverId);
      return reply.status(204).send();
    } catch (err) {
      return mapServerError(err);
    }
  });
}
