import { type FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from '@sovran/shared';
import { AttachmentError, type AttachmentService } from '@sovran/domain';
import { InitAttachmentRequestSchema } from '@sovran/proto';
import { type createAuthMiddleware } from '../plugins/auth';

interface AttachmentRouteDeps {
  attachmentService: AttachmentService;
  authenticate: ReturnType<typeof createAuthMiddleware>;
}

function mapAttachmentError(err: unknown): never {
  if (err instanceof AttachmentError) {
    const codeMap: Record<string, ErrorCode> = {
      VALIDATION: ErrorCode.VALIDATION,
      NOT_FOUND: ErrorCode.NOT_FOUND,
      FORBIDDEN: ErrorCode.FORBIDDEN,
    };
    throw new AppError(codeMap[err.kind] ?? ErrorCode.INTERNAL, err.message);
  }
  throw err;
}

export function registerAttachmentRoutes(app: FastifyInstance, deps: AttachmentRouteDeps): void {
  const { attachmentService, authenticate } = deps;

  app.post(
    '/servers/:serverId/channels/:channelId/attachments/init',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { serverId, channelId } = request.params as { serverId: string; channelId: string };
      const parsed = InitAttachmentRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION, 'Invalid attachment data', {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }

      try {
        const result = await attachmentService.initUpload(
          request.userId!,
          serverId,
          channelId,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        return mapAttachmentError(err);
      }
    },
  );

  app.post('/attachments/:attachmentId/complete', { preHandler: [authenticate] }, async (request, reply) => {
    const { attachmentId } = request.params as { attachmentId: string };

    try {
      await attachmentService.completeUpload(request.userId!, attachmentId);
      return reply.status(204).send();
    } catch (err) {
      return mapAttachmentError(err);
    }
  });

  app.get('/attachments/:attachmentId/download', { preHandler: [authenticate] }, async (request, reply) => {
    const { attachmentId } = request.params as { attachmentId: string };

    try {
      const downloadUrl = await attachmentService.getDownloadUrl(request.userId!, attachmentId);
      return reply.status(200).send({ url: downloadUrl });
    } catch (err) {
      return mapAttachmentError(err);
    }
  });
}
