-- Servers (communities/guilds).
-- Purpose: top-level container for channels and members.
-- Retention: persists until owner deletes or owner-transfer + deletion via worker.
-- Deletion: soft-delete (deleted_at), cascade to channels + members via worker.
-- DSAR: id, name, created_at exported (user is owner/member).

CREATE TABLE servers (
  id          VARCHAR(20)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  owner_id    VARCHAR(20)  NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_servers_owner
  ON servers (owner_id)
  WHERE deleted_at IS NULL;
