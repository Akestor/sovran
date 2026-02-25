import Fastify from 'fastify';
import { createLogger } from '@sovran/shared';
import { registerErrorHandler } from './plugins/error-handler';

const logger = createLogger({ name: 'api' });

export async function buildServer() {
  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576,
  });

  registerErrorHandler(app);

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.addHook('onRequest', (_request, _reply, done) => {
    logger.info(
      { method: _request.method, url: _request.url, requestId: _request.id },
      'Incoming request',
    );
    done();
  });

  app.addHook('onResponse', (_request, reply, done) => {
    logger.info(
      { method: _request.method, url: _request.url, statusCode: reply.statusCode, requestId: _request.id },
      'Request completed',
    );
    done();
  });

  return app;
}
