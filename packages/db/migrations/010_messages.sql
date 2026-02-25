-- Messages table
-- Retention: soft-delete via deleted_at, worker purge after configurable period
-- DSAR: content included in export, deleted_at messages excluded

CREATE TABLE messages (
  id          VARCHAR(20) PRIMARY KEY,
  channel_id  VARCHAR(20) NOT NULL REFERENCES channels(id),
  server_id   VARCHAR(20) NOT NULL REFERENCES servers(id),
  author_id   VARCHAR(20) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT        NOT NULL,
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary paging index: cursor-based with Snowflake IDs (time-ordered)
-- Supports: WHERE channel_id = $1 AND id < $before ORDER BY id DESC LIMIT $n
CREATE INDEX idx_messages_channel_paging ON messages (channel_id, id DESC)
  WHERE deleted_at IS NULL;

-- Author lookup for DSAR export and user deletion
CREATE INDEX idx_messages_author ON messages (author_id);
