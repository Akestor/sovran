-- Server membership.
-- Purpose: tracks which users belong to which servers and their role.
-- Retention: persists while user is member. Removed on leave or user deletion.
-- Deletion: hard delete (no content, just relationship). CASCADE on user delete.
-- DSAR: server_id, role, created_at exported (membership info).

CREATE TABLE members (
  server_id   VARCHAR(20)  NOT NULL REFERENCES servers(id),
  user_id     VARCHAR(20)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(10)  NOT NULL DEFAULT 'MEMBER',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id)
);

-- "My servers" lookup
CREATE INDEX idx_members_user
  ON members (user_id);

-- "Server members" listing
CREATE INDEX idx_members_server
  ON members (server_id, created_at);
