-- Attachments table (metadata only; content in MinIO)
-- Retention: soft-delete via deleted_at, worker purge object on server delete
-- DSAR: metadata (id, filename, size, created_at) in export

CREATE TABLE attachments (
  id           VARCHAR(20) PRIMARY KEY,
  server_id    VARCHAR(20) NOT NULL REFERENCES servers(id),
  channel_id   VARCHAR(20) NOT NULL REFERENCES channels(id),
  uploader_id  VARCHAR(20) REFERENCES users(id) ON DELETE SET NULL,
  object_key   VARCHAR(512) NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes   BIGINT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX idx_attachments_server ON attachments (server_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_attachments_channel ON attachments (channel_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_attachments_uploader ON attachments (uploader_id);
CREATE INDEX idx_attachments_status ON attachments (status) WHERE status IN ('pending', 'uploaded');
