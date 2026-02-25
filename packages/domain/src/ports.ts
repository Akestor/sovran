export interface OutboxPort {
  append(
    tx: unknown,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    },
  ): Promise<string>;
}

export interface DedupePort {
  check(userId: string, clientMutationId: string): Promise<{ isDuplicate: boolean }>;
  mark(userId: string, clientMutationId: string, ttlSeconds?: number): Promise<void>;
}
