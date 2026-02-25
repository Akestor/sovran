import { type WebSocket } from 'uWebSockets.js';
import { type ConnectionState } from '../connections';

export function handleMessageEvent(
  _ws: WebSocket<ConnectionState>,
  _type: string,
  _payload: Record<string, unknown>,
  _clientMutationId?: string,
): void {
  // Placeholder: message handling will be implemented with the message feature.
  // Flow: validate clientMutationId for dedupe -> forward to API -> outbox -> NATS -> fanout
}
