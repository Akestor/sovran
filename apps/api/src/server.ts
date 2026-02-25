import Fastify from 'fastify';
import { createLogger, SnowflakeGenerator, JoseTokenService, Argon2PasswordHasher, InMemoryMessageRateLimiter, RedisPresenceStore, getRedis } from '@sovran/shared';
import { AuthService, ServerService, ChannelService, MessageService } from '@sovran/domain';
import {
  withTransaction,
  PgUserRepository, PgRefreshTokenRepository, PgInviteCodeRepository,
  PgServerRepository, PgChannelRepository, PgMemberRepository, PgServerInviteRepository,
  PgMessageRepository,
  appendOutboxEvent,
} from '@sovran/db';
import { registerErrorHandler } from './plugins/error-handler';
import { createAuthMiddleware } from './plugins/auth';
import { createRateLimiter } from './plugins/rate-limit';
import { registerAuthRoutes } from './routes/auth';
import { registerServerRoutes } from './routes/servers';
import { registerChannelRoutes } from './routes/channels';
import { registerMessageRoutes } from './routes/messages';
import { registerPresenceRoutes } from './routes/presence';

const logger = createLogger({ name: 'api' });

export interface ServerConfig {
  jwtActiveKid: string;
  jwtKeys: Array<{ kid: string; secret: string }>;
  jwtAccessTokenTtl: string;
  jwtRefreshTokenTtlDays: number;
  corsOrigin: string;
  nodeId: number;
  maxChannelsPerServer: number;
  redisUrl: string;
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

  const outbox = {
    async append(tx: unknown, event: { aggregateType: string; aggregateId: string; eventType: string; payload: Record<string, unknown> }) {
      const eventId = idGen.generate();
      await appendOutboxEvent(tx as import('pg').PoolClient, eventId, event);
      return eventId;
    },
  };

  const authService = new AuthService({
    userRepo: new PgUserRepository(),
    refreshTokenRepo: new PgRefreshTokenRepository(),
    inviteCodeRepo: new PgInviteCodeRepository(),
    passwordHasher,
    tokenService,
    outbox,
    generateId: () => idGen.generate(),
    withTransaction,
    refreshTokenTtlDays: config.jwtRefreshTokenTtlDays,
  });

  const serverService = new ServerService({
    serverRepo: new PgServerRepository(),
    channelRepo: new PgChannelRepository(),
    memberRepo: new PgMemberRepository(),
    serverInviteRepo: new PgServerInviteRepository(),
    outbox,
    tokenService,
    generateId: () => idGen.generate(),
    withTransaction,
  });

  const channelService = new ChannelService({
    channelRepo: new PgChannelRepository(),
    memberRepo: new PgMemberRepository(),
    outbox,
    generateId: () => idGen.generate(),
    withTransaction,
    maxChannelsPerServer: config.maxChannelsPerServer,
  });

  const messageService = new MessageService({
    messageRepo: new PgMessageRepository(),
    memberRepo: new PgMemberRepository(),
    channelRepo: new PgChannelRepository(),
    outbox,
    rateLimiter: new InMemoryMessageRateLimiter(),
    generateId: () => idGen.generate(),
    withTransaction,
  });

  const authenticate = createAuthMiddleware(tokenService);
  const authRateLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  registerAuthRoutes(app, { authService, authenticate, authRateLimit });
  registerServerRoutes(app, { serverService, authenticate });
  registerChannelRoutes(app, { channelService, authenticate });
  registerMessageRoutes(app, { messageService, authenticate });

  const presenceStore = new RedisPresenceStore(getRedis());
  registerPresenceRoutes(app, {
    presenceStore,
    memberRepo: new PgMemberRepository(),
    authenticate,
    withTransaction,
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
