export interface ConnectionState {
  userId: string;
  sessionId: string;
  authenticated: boolean;
  lastHeartbeat: number;
  messageCount: number;
  messageWindowStart: number;
  subscriptions: string[];
}

export function createConnectionState(sessionId: string, userId: string): ConnectionState {
  return {
    userId,
    sessionId,
    authenticated: true,
    lastHeartbeat: Date.now(),
    messageCount: 0,
    messageWindowStart: Date.now(),
    subscriptions: [],
  };
}
