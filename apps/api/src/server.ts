import Fastify from 'fastify';
import { createLogger, SnowflakeGenerator, JoseTokenService, Argon2PasswordHasher } from '@sovran/shared';
import { AuthService } from '@sovran/domain';
import { withTransaction, PgUserRepository, PgRefreshTokenRepository, PgInviteCodeRepository, appendOutboxEvent } from '@sovran/db';
import { registerErrorHandler } from './plugins/error-handler';
import { createAuthMiddleware } from './plugins/auth';
import { createRateLimiter } from './plugins/rate-limit';
import { registerAuthRoutes } from './routes/auth';

const logger = createLogger({ name: 'api' });

export interface ServerConfig {
  jwtActiveKid: string;
  jwtKeys: Array<{ kid: string; secret: string }>;
  jwtAccessTokenTtl: string;
  jwtRefreshTokenTtlDays: number;
  corsOrigin: string;
  nodeId: number;
}

export async function buildServer(config: ServerConfig) {
  const app = Fastify({
    logger: false,
    bodyLimit: 1_048_576,
  });

  registerErrorHandler(app);

  const idGen = new SnowflakeGenerator(config.nodeId);
  const tokenService = new JoseTokenService({
    activeKid: config.jwtActiveKid,
    keys: config.jwtKeys,
    accessTokenTtl: config.jwtAccessTokenTtl,
  });
  const passwordHasher = new Argon2PasswordHasher();

  const authService = new AuthService({
    userRepo: new PgUserRepository(),
    refreshTokenRepo: new PgRefreshTokenRepository(),
    inviteCodeRepo: new PgInviteCodeRepository(),
    passwordHasher,
    tokenService,
    outbox: {
      async append(tx, event) {
        const eventId = idGen.generate();
        await appendOutboxEvent(tx as import('pg').PoolClient, eventId, event);
        return eventId;
      },
    },
    generateId: () => idGen.generate(),
    withTransaction,
    refreshTokenTtlDays: config.jwtRefreshTokenTtlDays,
  });

  const authenticate = createAuthMiddleware(tokenService);
  const authRateLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  registerAuthRoutes(app, { authService, authenticate, authRateLimit });

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
