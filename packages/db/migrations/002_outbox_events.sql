-- Outbox pattern table for reliable event publishing.
-- Purpose: stores domain events for guaranteed delivery to NATS.
-- Retention: published events cleaned by retention worker (default 7d).
-- Deletion: events reference aggregate IDs, not PII directly.
-- DSAR: not user-facing data, excluded from export.

CREATE TABLE outbox_events (
  id             BIGINT PRIMARY KEY,
  aggregate_type VARCHAR(64)  NOT NULL,
  aggregate_id   VARCHAR(128) NOT NULL,
  event_type     VARCHAR(128) NOT NULL,
  payload        JSONB        NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ,
  retry_count    INT          NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished
  ON outbox_events (created_at)
  WHERE published_at IS NULL;

CREATE INDEX idx_outbox_published
  ON outbox_events (published_at)
  WHERE published_at IS NOT NULL;
