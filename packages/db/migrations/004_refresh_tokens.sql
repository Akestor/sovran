-- Refresh tokens for token rotation.
-- Purpose: enables secure refresh flow with family-based rotation and revocation.
-- Retention: expired tokens cleaned by worker job after configurable grace period (default 30d).
-- Deletion: all tokens for user revoked + deleted on account deletion.
-- DSAR: excluded (technical security data, no user-facing content).

CREATE TABLE refresh_tokens (
  id          VARCHAR(20)  PRIMARY KEY,
  user_id     VARCHAR(20)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(128) NOT NULL,
  family_id   VARCHAR(20)  NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Lookup: find active (non-revoked, non-expired) token by hash
CREATE UNIQUE INDEX idx_refresh_token_hash
  ON refresh_tokens (token_hash);

-- Worker cleanup: find expired OR revoked tokens older than retention window.
-- Query: DELETE FROM refresh_tokens
--   WHERE (expires_at < NOW() - interval '30 days')
--      OR (revoked_at IS NOT NULL AND revoked_at < NOW() - interval '30 days');
CREATE INDEX idx_refresh_cleanup
  ON refresh_tokens (expires_at, revoked_at);

-- Family revocation: quickly revoke all tokens in a family on reuse detection
CREATE INDEX idx_refresh_family
  ON refresh_tokens (family_id)
  WHERE revoked_at IS NULL;

-- User lookup: revoke all tokens on logout/account deletion
CREATE INDEX idx_refresh_user
  ON refresh_tokens (user_id)
  WHERE revoked_at IS NULL;
