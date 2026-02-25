import { loadConfig, GatewayConfigSchema, createLogger, SnowflakeGenerator, JoseTokenService } from '@sovran/shared';
import { NatsSubjects } from '@sovran/proto';
import { createGateway } from './server';
import { initNats, closeNats, bridgeNatsToWs } from './nats';

const logger = createLogger({ name: 'gateway' });

async function main() {
  const config = loadConfig(GatewayConfigSchema);
  const idGen = new SnowflakeGenerator(config.NODE_ID);

  const tokenService = new JoseTokenService({
    activeKid: config.JWT_ACTIVE_KID,
    keys: config.JWT_KEYS,
    accessTokenTtl: config.JWT_ACCESS_TOKEN_TTL,
  });

  const natsConn = await initNats(config.NATS_URL);

  const { app, start } = createGateway({
    port: config.GATEWAY_PORT,
    host: config.GATEWAY_HOST,
    maxPayloadBytes: config.MAX_PAYLOAD_BYTES,
    rateLimitPerSecond: config.RATE_LIMIT_PER_SECOND,
    idGen,
    tokenService,
  });

  bridgeNatsToWs(natsConn, app, NatsSubjects.allServerEvents);

  start();

  const shutdown = async () => {
    logger.info({}, 'Shutting down gateway');
    await closeNats();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'Failed to start gateway');
  process.exit(1);
});
