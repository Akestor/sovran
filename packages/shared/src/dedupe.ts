export interface DedupeResult {
  isDuplicate: boolean;
}

export interface DedupeStore {
  check(userId: string, clientMutationId: string): Promise<DedupeResult>;
  mark(userId: string, clientMutationId: string, ttlSeconds?: number): Promise<void>;
}
