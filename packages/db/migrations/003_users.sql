-- Users table.
-- Purpose: stores account/identity data for authentication.
-- Retention: accounts persist until user requests deletion (Art. 17).
-- Deletion: soft-delete → anonymize (username → deleted_<id>, display_name → 'Deleted User',
--           password_hash → '!'). Hard purge after retention period via worker.
-- DSAR: id, username, display_name, created_at, updated_at exported.

CREATE TABLE users (
  id             VARCHAR(20)  PRIMARY KEY,
  username       VARCHAR(32)  NOT NULL,
  display_name   VARCHAR(64)  NOT NULL,
  password_hash  VARCHAR(256) NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- Partial unique index: only active (non-deleted) users must have unique usernames.
-- Deleted users get username = deleted_<id>, which won't conflict.
CREATE UNIQUE INDEX idx_users_username_active
  ON users (username)
  WHERE deleted_at IS NULL;
