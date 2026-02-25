import { connect, type NatsConnection, type Subscription, StringCodec } from 'nats';
import { type TemplatedApp } from 'uWebSockets.js';
import { createLogger } from '@sovran/shared';

const logger = createLogger({ name: 'gateway:nats' });
const sc = StringCodec();

let nc: NatsConnection | null = null;
const subscriptions: Subscription[] = [];

export async function initNats(url: string): Promise<NatsConnection> {
  nc = await connect({ servers: url });
  logger.info({}, 'Connected to NATS');
  return nc;
}

export async function closeNats(): Promise<void> {
  for (const sub of subscriptions) {
    sub.unsubscribe();
  }
  subscriptions.length = 0;
  if (nc) {
    await nc.drain();
    nc = null;
    logger.info({}, 'NATS connection closed');
  }
}

export function bridgeNatsToWs(
  natsConn: NatsConnection,
  app: TemplatedApp,
  subjectPattern: string,
): void {
  const sub = natsConn.subscribe(subjectPattern);
  subscriptions.push(sub);

  (async () => {
    for await (const msg of sub) {
      const subject = msg.subject;
      const data = sc.decode(msg.data);
      app.publish(subject, data, false);
    }
  })().catch((err) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'NATS subscription error',
    );
  });

  logger.info({ subject: subjectPattern }, 'Bridging NATS to WebSocket topics');
}
