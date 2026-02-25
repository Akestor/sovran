import { createLogger, SnowflakeGenerator } from '@sovran/shared';
import {
  withTransaction,
  PgUserRepository,
  PgRefreshTokenRepository,
  appendOutboxEvent,
} from '@sovran/db';

const logger = createLogger({ name: 'worker:deletion' });
const userRepo = new PgUserRepository();
const refreshTokenRepo = new PgRefreshTokenRepository();
const idGen = new SnowflakeGenerator(Number(process.env.NODE_ID ?? '0'));

export async function runDeletionJob(): Promise<void> {
  logger.info({}, 'Deletion job started');

  await withTransaction(async (tx) => {
    const result = await tx.query(
      `SELECT id FROM users
       WHERE deleted_at IS NOT NULL
         AND username NOT LIKE 'deleted_%'
       LIMIT 50
       FOR UPDATE SKIP LOCKED`,
    );

    if (result.rows.length === 0) return;

    for (const row of result.rows) {
      const userId = String(row.id);

      await userRepo.softDelete(tx, userId);
      await refreshTokenRepo.revokeAllForUser(tx, userId);

      await appendOutboxEvent(tx, idGen.generate(), {
        aggregateType: 'user',
        aggregateId: userId,
        eventType: 'USER_DELETED',
        payload: { userId },
      });

      logger.info({ userId }, 'User account anonymized and tokens revoked');
    }

    logger.info({ count: result.rows.length }, 'Deletion batch processed');
  });

  logger.info({}, 'Deletion job completed');
}
