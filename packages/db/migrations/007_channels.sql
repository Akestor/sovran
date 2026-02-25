-- Channels within servers.
-- Purpose: named conversation space within a server.
-- Retention: persists until deleted by admin/owner or server deletion.
-- Deletion: soft-delete (deleted_at). Hard purge of messages via worker (future).
-- DSAR: id, server_id, name, type, created_at exported for servers user is member of.

CREATE TABLE channels (
  id          VARCHAR(20)  PRIMARY KEY,
  server_id   VARCHAR(20)  NOT NULL REFERENCES servers(id),
  name        VARCHAR(80)  NOT NULL,
  type        VARCHAR(20)  NOT NULL DEFAULT 'text',
  position    INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- Active channels per server, unique name within a server
CREATE UNIQUE INDEX idx_channels_server_name_active
  ON channels (server_id, name)
  WHERE deleted_at IS NULL;

-- List channels for a server
CREATE INDEX idx_channels_server_id
  ON channels (server_id, position)
  WHERE deleted_at IS NULL;
