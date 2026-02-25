-- Invite codes for registration gating (bot/spam protection without IP logging).
-- Purpose: controls registration access via invite-only system.
-- Retention: codes kept for audit trail; expired codes cleaned by worker after 90d.
-- Deletion: created_by nullified on user account deletion (ON DELETE SET NULL).
-- DSAR: excluded (technical/operational data, not user content).
--   Documented reason: invite codes are operational access-control artifacts.
--   created_by is a foreign key for audit, not user-facing data.

CREATE TABLE invite_codes (
  id          VARCHAR(20)  PRIMARY KEY,
  code_hash   VARCHAR(128) NOT NULL,
  created_by  VARCHAR(20)  REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  max_uses    INT          NOT NULL DEFAULT 1,
  use_count   INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_invite_code_hash
  ON invite_codes (code_hash);

-- Find valid (non-expired, not fully used) codes
CREATE INDEX idx_invite_codes_valid
  ON invite_codes (expires_at)
  WHERE use_count < max_uses;
