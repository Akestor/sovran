import { loadConfig, WorkerConfigSchema, createLogger, startHealthBeat } from '@sovran/shared';
import { initPool, closePool } from '@sovran/db';
import { connect } from 'nats';
import { startOutboxPublisher } from './outbox-publisher';
import { runDeletionJob } from './jobs/deletion';
import { runRetentionJob } from './jobs/retention';
import { runDsarExportJob } from './jobs/dsar';
import { runAttachmentScanJob } from './jobs/attachment-scan';

const logger = createLogger({ name: 'worker' });

async function main() {
  const config = loadConfig(WorkerConfigSchema);

  initPool({ connectionString: config.DATABASE_URL });

  const natsConn = await connect({ servers: config.NATS_URL });
  logger.info({}, 'Connected to NATS');

  const healthBeat = startHealthBeat(5000, config.WORKER_HEALTHCHECK_PATH);

  const outboxPublisher = await startOutboxPublisher(natsConn, {
    pollIntervalMs: config.OUTBOX_POLL_INTERVAL_MS,
    batchSize: config.OUTBOX_BATCH_SIZE,
  });

  const jobIntervals = [
    setInterval(() => {
      runDeletionJob().catch(logJobError('deletion'));
    }, 60_000),
    setInterval(() => {
      runRetentionJob().catch(logJobError('retention'));
    }, 3_600_000),
    setInterval(() => {
      runDsarExportJob().catch(logJobError('dsar'));
    }, 60_000),
    setInterval(() => {
      runAttachmentScanJob().catch(logJobError('attachment-scan'));
    }, 5_000),
  ];

  logger.info({}, 'Worker started');

  const shutdown = async () => {
    logger.info({}, 'Shutting down worker');
    healthBeat.stop();
    outboxPublisher.stop();
    for (const interval of jobIntervals) clearInterval(interval);
    await natsConn.drain();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function logJobError(jobName: string) {
  return (err: unknown) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), job: jobName },
      'Job failed',
    );
  };
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'Failed to start worker');
  process.exit(1);
});
