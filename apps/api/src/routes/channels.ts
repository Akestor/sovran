import { type FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from '@sovran/shared';
import { ChannelError, type ChannelService } from '@sovran/domain';
import {
  CreateChannelRequestSchema,
  RenameChannelRequestSchema,
} from '@sovran/proto';
import { type createAuthMiddleware } from '../plugins/auth';

interface ChannelRouteDeps {
  channelService: ChannelService;
  authenticate: ReturnType<typeof createAuthMiddleware>;
}

function mapChannelError(err: unknown): never {
  if (err instanceof ChannelError) {
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

export function registerChannelRoutes(app: FastifyInstance, deps: ChannelRouteDeps): void {
  const { channelService, authenticate } = deps;

  app.post('/servers/:serverId/channels', { preHandler: [authenticate] }, async (request, reply) => {
    const { serverId } = request.params as { serverId: string };
    const parsed = CreateChannelRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid channel data', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const channel = await channelService.createChannel(request.userId!, serverId, parsed.data);
      return reply.status(201).send({
        id: channel.id,
        serverId: channel.serverId,
        name: channel.name,
        type: channel.type,
        position: channel.position,
        createdAt: channel.createdAt.toISOString(),
      });
    } catch (err) {
      return mapChannelError(err);
    }
  });

  app.get('/servers/:serverId/channels', { preHandler: [authenticate] }, async (request, reply) => {
    const { serverId } = request.params as { serverId: string };

    try {
      const channels = await channelService.listChannels(request.userId!, serverId);
      return reply.status(200).send(
        channels.map((ch) => ({
          id: ch.id,
          serverId: ch.serverId,
          name: ch.name,
          type: ch.type,
          position: ch.position,
          createdAt: ch.createdAt.toISOString(),
        })),
      );
    } catch (err) {
      return mapChannelError(err);
    }
  });

  app.patch('/channels/:channelId', { preHandler: [authenticate] }, async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const parsed = RenameChannelRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid channel data', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      await channelService.renameChannel(request.userId!, channelId, parsed.data.name);
      return reply.status(204).send();
    } catch (err) {
      return mapChannelError(err);
    }
  });

  app.delete('/channels/:channelId', { preHandler: [authenticate] }, async (request, reply) => {
    const { channelId } = request.params as { channelId: string };

    try {
      await channelService.deleteChannel(request.userId!, channelId);
      return reply.status(204).send();
    } catch (err) {
      return mapChannelError(err);
    }
  });
}
