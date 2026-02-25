import { type NatsConnection, StringCodec } from 'nats';
import { fetchUnpublishedEvents, markPublished, getPool } from '@sovran/db';
import { createLogger } from '@sovran/shared';
import { resolveOutboxSubject } from '@sovran/proto';

const logger = createLogger({ name: 'worker:outbox' });
const sc = StringCodec();

export async function startOutboxPublisher(
  natsConn: NatsConnection,
  opts: { pollIntervalMs: number; batchSize: number },
): Promise<{ stop: () => void }> {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const client = await getPool().connect();
        try {
          await client.query('BEGIN');
          const events = await fetchUnpublishedEvents(client, opts.batchSize);

          if (events.length > 0) {
            const publishedIds: string[] = [];

            for (const event of events) {
              const meta = event.payload as {
                serverId?: string;
                channelId?: string;
                userId?: string;
              };
              const subject = resolveOutboxSubject(
                event.aggregateType,
                event.aggregateId,
                event.eventType,
                meta,
              );
              natsConn.publish(
                subject,
                sc.encode(
                  JSON.stringify({
                    eventId: event.id,
                    eventType: event.eventType,
                    aggregateType: event.aggregateType,
                    aggregateId: event.aggregateId,
                    payload: event.payload,
                    createdAt: event.createdAt.toISOString(),
                  }),
                ),
              );
              publishedIds.push(event.id);
            }

            await markPublished(client, publishedIds);
            await client.query('COMMIT');

            logger.info({ count: publishedIds.length }, 'Published outbox events');
          } else {
            await client.query('COMMIT');
          }
        } catch (innerErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw innerErr;
        } finally {
          client.release();
        }
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'Outbox publisher error',
        );
      }

      await sleep(opts.pollIntervalMs);
    }
  };

  loop().catch((err) => {
    logger.fatal(
      { err: err instanceof Error ? err.message : String(err) },
      'Outbox publisher crashed',
    );
  });

  return {
    stop: () => {
      running = false;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
