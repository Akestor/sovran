import { type FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from '@sovran/shared';
import { MessageError, type MessageService } from '@sovran/domain';
import {
  SendMessageRequestSchema,
  ListMessagesQuerySchema,
} from '@sovran/proto';
import { type createAuthMiddleware } from '../plugins/auth';

interface MessageRouteDeps {
  messageService: MessageService;
  authenticate: ReturnType<typeof createAuthMiddleware>;
}

function mapMessageError(err: unknown): never {
  if (err instanceof MessageError) {
    const codeMap: Record<string, ErrorCode> = {
      VALIDATION: ErrorCode.VALIDATION,
      NOT_FOUND: ErrorCode.NOT_FOUND,
      FORBIDDEN: ErrorCode.FORBIDDEN,
      RATE_LIMITED: ErrorCode.RATE_LIMITED,
    };
    throw new AppError(codeMap[err.kind] ?? ErrorCode.INTERNAL, err.message);
  }
  throw err;
}

export function registerMessageRoutes(app: FastifyInstance, deps: MessageRouteDeps): void {
  const { messageService, authenticate } = deps;

  app.post('/servers/:serverId/channels/:channelId/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const { serverId, channelId } = request.params as { serverId: string; channelId: string };
    const parsed = SendMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid message data', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const message = await messageService.sendMessage(request.userId!, serverId, channelId, {
        content: parsed.data.content,
        nonce: parsed.data.nonce,
        attachmentIds: parsed.data.attachmentIds,
      });
      return reply.status(201).send({
        id: message.id,
        channelId: message.channelId,
        serverId: message.serverId,
        authorId: message.authorId,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        editedAt: null,
        deletedAt: null,
        ...(message.attachments ? { attachments: message.attachments } : {}),
      });
    } catch (err) {
      return mapMessageError(err);
    }
  });

  app.get('/servers/:serverId/channels/:channelId/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const { serverId, channelId } = request.params as { serverId: string; channelId: string };
    const parsed = ListMessagesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION, 'Invalid query parameters');
    }

    try {
      const messages = await messageService.listMessages(request.userId!, serverId, channelId, parsed.data);
      return reply.status(200).send(
        messages.map((m) => ({
          id: m.id,
          channelId: m.channelId,
          serverId: m.serverId,
          authorId: m.authorId,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          editedAt: m.editedAt?.toISOString() ?? null,
          deletedAt: m.deletedAt?.toISOString() ?? null,
          ...(m.attachments ? { attachments: m.attachments } : {}),
        })),
      );
    } catch (err) {
      return mapMessageError(err);
    }
  });

  app.delete('/messages/:messageId', { preHandler: [authenticate] }, async (request, reply) => {
    const { messageId } = request.params as { messageId: string };

    try {
      await messageService.deleteMessage(request.userId!, messageId);
      return reply.status(204).send();
    } catch (err) {
      return mapMessageError(err);
    }
  });
}
