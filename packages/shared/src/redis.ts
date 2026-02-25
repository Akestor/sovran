import Redis from 'ioredis';
import { createLogger } from './logger';

const logger = createLogger({ name: 'redis' });

let client: Redis | null = null;

export function initRedis(url: string): Redis {
  if (client) return client;
  client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
  logger.info({}, 'Redis client initialized');
  return client;
}

export function getRedis(): Redis {
  if (!client) throw new Error('Redis not initialized. Call initRedis() first.');
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    logger.info({}, 'Redis client closed');
  }
}
