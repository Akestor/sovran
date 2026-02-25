-- Server invite codes.
-- Purpose: allows users to join a specific server via invite link.
-- Retention: kept for audit; expired/revoked codes cleaned by worker after 90d.
-- Deletion: created_by references user (ON DELETE SET NULL for audit trail).
-- DSAR: excluded (operational access-control artifacts, not user content).

CREATE TABLE server_invites (
  id            VARCHAR(20)  PRIMARY KEY,
  server_id     VARCHAR(20)  NOT NULL REFERENCES servers(id),
  code_hash     VARCHAR(128) NOT NULL,
  created_by    VARCHAR(20)  REFERENCES users(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ  NOT NULL,
  max_uses      INT          NOT NULL DEFAULT 25,
  uses          INT          NOT NULL DEFAULT 0,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_server_invites_code_hash
  ON server_invites (code_hash);

-- Find valid invites for a server
CREATE INDEX idx_server_invites_server
  ON server_invites (server_id)
  WHERE revoked_at IS NULL;
