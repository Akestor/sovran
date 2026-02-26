import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { createLogger, SnowflakeGenerator, JoseTokenService, Argon2PasswordHasher, InMemoryMessageRateLimiter, RedisPresenceStore, getRedis, MinioObjectStorage } from '@sovran/shared';
import { AuthService, ServerService, ChannelService, MessageService, AttachmentService } from '@sovran/domain';
import {
  withTransaction,
  PgUserRepository, PgRefreshTokenRepository, PgInviteCodeRepository,
  PgServerRepository, PgChannelRepository, PgMemberRepository, PgServerInviteRepository,
  PgMessageRepository, PgAttachmentRepository, PgMessageAttachmentRepository,
  appendOutboxEvent,
} from '@sovran/db';
import { registerErrorHandler } from './plugins/error-handler';
import { createAuthMiddleware } from './plugins/auth';
import { createRateLimiter, createUserRateLimiter } from './plugins/rate-limit';
import { registerAuthRoutes } from './routes/auth';
import { registerServerRoutes } from './routes/servers';
import { registerChannelRoutes } from './routes/channels';
import { registerMessageRoutes } from './routes/messages';
import { registerAttachmentRoutes } from './routes/attachments';
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
  minioEndpoint: string;
  minioPublicEndpoint?: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioBucket: string;
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

  const attachmentRepo = new PgAttachmentRepository();
  const messageAttachmentRepo = new PgMessageAttachmentRepository();
  const objectStorage = new MinioObjectStorage({
    endpoint: config.minioEndpoint,
    publicEndpoint: config.minioPublicEndpoint,
    accessKey: config.minioAccessKey,
    secretKey: config.minioSecretKey,
    bucket: config.minioBucket,
  });
  await objectStorage.ensureBucket();

  const attachmentService = new AttachmentService({
    attachmentRepo,
    messageAttachmentRepo,
    memberRepo: new PgMemberRepository(),
    channelRepo: new PgChannelRepository(),
    objectStorage,
    outbox,
    generateId: () => idGen.generate(),
    generateUuid: () => randomUUID(),
    withTransaction,
  });

  const messageService = new MessageService({
    messageRepo: new PgMessageRepository(),
    memberRepo: new PgMemberRepository(),
    channelRepo: new PgChannelRepository(),
    attachmentRepo,
    messageAttachmentRepo,
    outbox,
    rateLimiter: new InMemoryMessageRateLimiter(),
    generateId: () => idGen.generate(),
    withTransaction,
  });

  const authenticate = createAuthMiddleware(tokenService);
  const authRateLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });
  const attachmentInitRateLimit = createUserRateLimiter({ windowMs: 60_000, maxRequests: 30 });
  const attachmentCompleteRateLimit = createUserRateLimiter({ windowMs: 60_000, maxRequests: 60 });
  const attachmentDownloadRateLimit = createUserRateLimiter({ windowMs: 60_000, maxRequests: 120 });

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  registerAuthRoutes(app, { authService, authenticate, authRateLimit });
  registerServerRoutes(app, { serverService, authenticate });
  registerChannelRoutes(app, { channelService, authenticate });
  registerMessageRoutes(app, { messageService, authenticate });
  registerAttachmentRoutes(app, {
    attachmentService,
    authenticate,
    attachmentInitRateLimit,
    attachmentCompleteRateLimit,
    attachmentDownloadRateLimit,
  });

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
