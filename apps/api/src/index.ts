import { buildServer } from './server';
import { loadConfig, ApiConfigSchema, createLogger } from '@sovran/shared';
import { initPool, closePool } from '@sovran/db';

const logger = createLogger({ name: 'api' });

async function main() {
  const config = loadConfig(ApiConfigSchema);

  initPool({ connectionString: config.DATABASE_URL });

  const app = await buildServer();

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  logger.info({ port: config.API_PORT }, 'API server started');

  const shutdown = async () => {
    logger.info({}, 'Shutting down API server');
    await app.close();
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
