import { buildServer } from './server';
import { loadConfig, ApiConfigSchema, createLogger, initRedis, closeRedis } from '@sovran/shared';
import { initPool, closePool } from '@sovran/db';

const logger = createLogger({ name: 'api' });

async function main() {
  const config = loadConfig(ApiConfigSchema);

  initPool({ connectionString: config.DATABASE_URL });
  initRedis(config.REDIS_URL);

  const app = await buildServer({
    jwtActiveKid: config.JWT_ACTIVE_KID,
    jwtKeys: config.JWT_KEYS,
    jwtAccessTokenTtl: config.JWT_ACCESS_TOKEN_TTL,
    jwtRefreshTokenTtlDays: config.JWT_REFRESH_TOKEN_TTL_DAYS,
    corsOrigin: config.CORS_ORIGIN,
    nodeId: config.NODE_ID,
    maxChannelsPerServer: config.MAX_CHANNELS_PER_SERVER,
    redisUrl: config.REDIS_URL,
    minioEndpoint: config.MINIO_ENDPOINT,
    minioAccessKey: config.MINIO_ACCESS_KEY,
    minioSecretKey: config.MINIO_SECRET_KEY,
    minioBucket: config.MINIO_BUCKET,
  });

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  logger.info({ port: config.API_PORT }, 'API server started');

  const shutdown = async () => {
    logger.info({}, 'Shutting down API server');
    await app.close();
    await closeRedis();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'Failed to start API');
  process.exit(1);
});
