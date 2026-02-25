import { createLogger } from '@sovran/shared';
import { withTransaction, PgRefreshTokenRepository } from '@sovran/db';

const logger = createLogger({ name: 'worker:retention' });
const refreshTokenRepo = new PgRefreshTokenRepository();

const OUTBOX_RETENTION_DAYS = 7;
const REFRESH_TOKEN_RETENTION_DAYS = 30;

export async function runRetentionJob(): Promise<void> {
  logger.info({}, 'Retention sweep started');

  const deletedTokens = await withTransaction(async (tx) => {
    return refreshTokenRepo.deleteExpired(tx, REFRESH_TOKEN_RETENTION_DAYS);
  });
  if (deletedTokens > 0) {
    logger.info({ count: deletedTokens }, 'Cleaned up expired refresh tokens');
  }

  await withTransaction(async (tx) => {
    const result = await tx.query(
      `DELETE FROM outbox_events
       WHERE published_at IS NOT NULL
         AND published_at < NOW() - make_interval(days => $1)`,
      [OUTBOX_RETENTION_DAYS],
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ count }, 'Cleaned up old outbox events');
    }
  });

  logger.info({}, 'Retention sweep completed');
}
