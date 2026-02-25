export interface ConnectionState {
  userId: string | null;
  sessionId: string;
  authenticated: boolean;
  lastHeartbeat: number;
  messageCount: number;
  messageWindowStart: number;
  subscriptions: string[];
}

export function createConnectionState(sessionId: string): ConnectionState {
  return {
    userId: null,
    sessionId,
    authenticated: false,
    lastHeartbeat: Date.now(),
    messageCount: 0,
    messageWindowStart: Date.now(),
    subscriptions: [],
  };
}
