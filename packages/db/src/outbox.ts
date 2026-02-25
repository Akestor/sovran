import { type PoolClient } from 'pg';

export interface OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  publishedAt: Date | null;
  retryCount: number;
}

export async function appendOutboxEvent(
  client: PoolClient,
  id: string,
  event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, event.aggregateType, event.aggregateId, event.eventType, JSON.stringify(event.payload)],
  );
}

export async function fetchUnpublishedEvents(
  client: PoolClient,
  batchSize: number,
): Promise<OutboxEvent[]> {
  const result = await client.query(
    `SELECT id, aggregate_type, aggregate_id, event_type, payload,
            created_at, published_at, retry_count
     FROM outbox_events
     WHERE published_at IS NULL
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [batchSize],
  );
  return result.rows.map(mapRow);
}

export async function markPublished(
  client: PoolClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await client.query(
    `UPDATE outbox_events SET published_at = NOW() WHERE id = ANY($1::bigint[])`,
    [ids],
  );
}

function mapRow(row: Record<string, unknown>): OutboxEvent {
  return {
    id: String(row.id),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    eventType: String(row.event_type),
    payload: row.payload as Record<string, unknown>,
    createdAt: row.created_at as Date,
    publishedAt: (row.published_at as Date | null) ?? null,
    retryCount: Number(row.retry_count),
  };
}
