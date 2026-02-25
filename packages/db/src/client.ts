import { Pool, type PoolConfig, type PoolClient } from 'pg';
import { createLogger } from '@sovran/shared';

const logger = createLogger({ name: 'db' });

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) throw new Error('Database pool not initialized. Call initPool first.');
  return pool;
}

export function initPool(config: PoolConfig): Pool {
  pool = new Pool(config);
  pool.on('error', (err) => {
    logger.error({ err: err.message }, 'Unexpected database pool error');
  });
  logger.info({}, 'Database pool initialized');
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info({}, 'Database pool closed');
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
