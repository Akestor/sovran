import uWS, { type TemplatedApp, type WebSocket } from 'uWebSockets.js';
import { createLogger, type SnowflakeGenerator, type TokenService } from '@sovran/shared';
import {
  GATEWAY_HELLO,
  GATEWAY_HEARTBEAT,
  GATEWAY_HEARTBEAT_ACK,
  GATEWAY_READY,
  ClientMessageSchema,
  createEnvelope,
  NatsSubjects,
} from '@sovran/proto';
import { type ConnectionState, createConnectionState } from './connections';
import { RateLimiter } from './rate-limiter';
import { type MemberRole } from '@sovran/domain';

const logger = createLogger({ name: 'gateway' });

export interface GatewayOptions {
  port: number;
  host: string;
  maxPayloadBytes: number;
  rateLimitPerSecond: number;
  idGen: SnowflakeGenerator;
  tokenService: TokenService;
  fetchUserServers: (userId: string) => Promise<Array<{ id: string; name: string; role: MemberRole }>>;
}

function subscribeToServerTopics(ws: WebSocket<ConnectionState>, serverId: string): void {
  ws.subscribe(NatsSubjects.serverEvents(serverId));
  ws.subscribe(NatsSubjects.serverChannelWildcard(serverId));
}

export function createGateway(options: GatewayOptions): { app: TemplatedApp; start: () => void } {
  const { port, host, maxPayloadBytes, rateLimitPerSecond, idGen, tokenService, fetchUserServers } = options;
  const rateLimiter = new RateLimiter(rateLimitPerSecond);

  const app = uWS.App();

  app.ws<ConnectionState>('/*', {
    maxPayloadLength: maxPayloadBytes,
    idleTimeout: 120,
    maxBackpressure: 1024 * 1024,

    upgrade: (res, req, context) => {
      const query = req.getQuery();
      const params = new URLSearchParams(query);
      const token = params.get('token');

      const secWsKey = req.getHeader('sec-websocket-key');
      const secWsProtocol = req.getHeader('sec-websocket-protocol');
      const secWsExtensions = req.getHeader('sec-websocket-extensions');

      if (!token) {
        res.writeStatus('401 Unauthorized').end('Missing token');
        return;
      }

      let aborted = false;
      res.onAborted(() => { aborted = true; });

      tokenService.verifyAccessToken(token).then(({ userId }) => {
        if (aborted) return;
        const sessionId = idGen.generate();
        const state = createConnectionState(sessionId, userId);

        res.upgrade<ConnectionState>(
          state,
          secWsKey,
          secWsProtocol,
          secWsExtensions,
          context,
        );
      }).catch(() => {
        if (aborted) return;
        res.writeStatus('401 Unauthorized').end('Invalid token');
      });
    },

    open: (ws) => {
      const state = ws.getUserData();
      logger.info({ sessionId: state.sessionId }, 'WebSocket connection opened (authenticated)');

      const hello = createEnvelope(idGen.generate(), GATEWAY_HELLO, {
        payload: { heartbeatIntervalMs: 30000 },
      });
      ws.send(JSON.stringify(hello), false);

      fetchUserServers(state.userId).then((servers) => {
        for (const server of servers) {
          subscribeToServerTopics(ws, server.id);
          state.subscriptions.push(
            NatsSubjects.serverEvents(server.id),
            NatsSubjects.serverChannelWildcard(server.id),
          );
        }

        const ready = createEnvelope(idGen.generate(), GATEWAY_READY, {
          payload: {
            sessionId: state.sessionId,
            userId: state.userId,
            servers: servers.map((s) => ({ id: s.id, name: s.name, role: s.role })),
          },
        });
        ws.send(JSON.stringify(ready), false);
      }).catch((err) => {
        logger.error(
          { sessionId: state.sessionId, err: err instanceof Error ? err.message : String(err) },
          'Failed to fetch user servers for READY',
        );
      });
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
