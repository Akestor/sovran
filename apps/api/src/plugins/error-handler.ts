import { type FastifyInstance } from 'fastify';
import { AppError, ErrorCode, createLogger } from '@sovran/shared';

const logger = createLogger({ name: 'api:error' });

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      logger.warn(
        { code: error.code, ...error.safeMeta },
        error.message,
      );
      return reply.status(error.httpStatus).send(error.toJSON());
    }

    logger.error({ err: error.message }, 'Unhandled error');

    return reply.status(500).send({
      code: ErrorCode.INTERNAL,
      message: 'Internal server error',
    });
  });
}
