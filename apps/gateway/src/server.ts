import uWS, { type TemplatedApp } from 'uWebSockets.js';
import { createLogger, type SnowflakeGenerator } from '@sovran/shared';
import {
  GATEWAY_HELLO,
  GATEWAY_HEARTBEAT,
  GATEWAY_HEARTBEAT_ACK,
  ClientMessageSchema,
  createEnvelope,
} from '@sovran/proto';
import { type ConnectionState, createConnectionState } from './connections';
import { RateLimiter } from './rate-limiter';

const logger = createLogger({ name: 'gateway' });

export interface GatewayOptions {
  port: number;
  host: string;
  maxPayloadBytes: number;
  rateLimitPerSecond: number;
  idGen: SnowflakeGenerator;
}

export function createGateway(options: GatewayOptions): { app: TemplatedApp; start: () => void } {
  const { port, host, maxPayloadBytes, rateLimitPerSecond, idGen } = options;
  const rateLimiter = new RateLimiter(rateLimitPerSecond);

  const app = uWS.App();

  app.ws<ConnectionState>('/*', {
    maxPayloadLength: maxPayloadBytes,
    idleTimeout: 120,
    maxBackpressure: 1024 * 1024,

    upgrade: (res, req, context) => {
      const sessionId = idGen.generate();
      const state = createConnectionState(sessionId);

      res.upgrade<ConnectionState>(
        state,
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context,
      );
    },

    open: (ws) => {
      const state = ws.getUserData();
      logger.info({ sessionId: state.sessionId }, 'WebSocket connection opened');

      const hello = createEnvelope(idGen.generate(), GATEWAY_HELLO, {
        payload: { heartbeatIntervalMs: 30000 },
      });
      ws.send(JSON.stringify(hello), false);
    },

    message: (ws, message, _isBinary) => {
      const state = ws.getUserData();

      if (!rateLimiter.allow(state)) {
        logger.warn({ sessionId: state.sessionId }, 'Rate limited, closing connection');
        ws.end(4005, 'Rate limited');
        return;
      }

      try {
        const text = Buffer.from(message).toString('utf-8');
        const parsed = ClientMessageSchema.safeParse(JSON.parse(text));

        if (!parsed.success) {
          logger.warn({ sessionId: state.sessionId }, 'Invalid message format');
          return;
        }

        const { type, clientMutationId } = parsed.data;

        if (type === GATEWAY_HEARTBEAT) {
          state.lastHeartbeat = Date.now();
          const ack = createEnvelope(idGen.generate(), GATEWAY_HEARTBEAT_ACK);
          ws.send(JSON.stringify(ack), false);
          return;
        }

        logger.debug(
          { sessionId: state.sessionId, type, clientMutationId },
          'Received client message',
        );
      } catch {
        logger.warn({ sessionId: state.sessionId }, 'Failed to parse message');
      }
    },

    close: (ws, code, _message) => {
      const state = ws.getUserData();
      logger.info({ sessionId: state.sessionId, code }, 'WebSocket connection closed');
    },

    drain: (ws) => {
      const state = ws.getUserData();
      logger.debug(
        { sessionId: state.sessionId, bufferedAmount: ws.getBufferedAmount() },
        'Backpressure drain',
      );
    },
  });

  app.get('/health', (res, _req) => {
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  });

  return {
    app,
    start: () => {
      app.listen(host, port, (listenSocket) => {
        if (listenSocket) {
          logger.info({ host, port }, 'Gateway listening');
        } else {
          logger.fatal({ host, port }, 'Failed to listen');
          process.exit(1);
        }
      });
    },
  };
}
