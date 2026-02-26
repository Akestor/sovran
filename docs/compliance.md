# Compliance & Data Protection

This document describes the GDPR compliance posture of the Sovran platform.
All features must be developed with privacy-by-design and data minimization as defaults.

---

## Data Categories

| Category | Examples | Storage | PII? |
|---|---|---|---|
| **Account data** | userId, username, display name, password hash | PostgreSQL `users` | Minimal PII |
| **Auth tokens** | Refresh token hashes, family IDs | PostgreSQL `refresh_tokens` | No PII (hashed) |
| **Invite codes** | Code hashes, usage counts | PostgreSQL `invite_codes` | No PII (hashed) |
| **Content data** | Messages, attachments | PostgreSQL + object storage | Separate from identity |
| **Ephemeral data** | Presence (status), typing indicators | Redis with TTL (60s / 8s) | Not persisted, no `lastSeenAt` |
| **Server data** | Server name, channels, member roles | PostgreSQL `servers`, `channels`, `members` | Minimal PII (userId only) |
| **Messages** | Message content, author reference | PostgreSQL `messages` | Content data (separate from identity) |
| **Server invites** | Code hashes, usage counts | PostgreSQL `server_invites` | No PII (hashed) |
| **System data** | Outbox events, migrations | PostgreSQL | No PII |

### Separation principle
Account/identity data is kept separate from content data where possible, minimizing the blast radius of any data breach and simplifying deletion/anonymization.

---

## Right to Erasure (Art. 17)

**Implementation**: `apps/worker/src/jobs/deletion.ts`

When a user exercises their right to erasure:

1. User record is soft-deleted (`deleted_at` set) via API
2. The deletion worker job processes users with `deleted_at IS NOT NULL` and non-anonymized username
3. Data is anonymized:
   - **PostgreSQL `users`**: `username → deleted_<id>`, `display_name → 'Deleted User'`, `password_hash → '!'`
   - **PostgreSQL `refresh_tokens`**: all tokens revoked, then cascade-deleted
   - **PostgreSQL `invite_codes`**: `created_by` set to NULL (ON DELETE SET NULL)
   - **PostgreSQL `messages`**: `author_id` set to NULL (ON DELETE SET NULL), content retained for channel context
   - **PostgreSQL `members`**: rows cascade-deleted (ON DELETE CASCADE on `user_id`)
   - **PostgreSQL `server_invites`**: `created_by` set to NULL (ON DELETE SET NULL)
   - **PostgreSQL `servers`**: ownership transferred (oldest admin → oldest member → server deleted)
   - **Redis cache**: user-related cache keys purged (future)
   - **Object storage**: user-uploaded attachments deleted (future)
4. `USER_DELETED` outbox event published for downstream consumers

**Properties**:
- Idempotent: `softDelete` checks `deleted_at IS NULL`, worker uses `SKIP LOCKED`
- No re-normalization conflict: `deleted_<id>` is already lowercase
- Partial unique index excludes deleted users from username uniqueness check
- Propagation: covers all current storage layers systematically

---

## DSAR Export (Art. 15/20)

**Implementation**: `apps/worker/src/jobs/dsar.ts`

When a user requests a data export:

1. A DSAR request is created in the database
2. The DSAR worker job collects all user-related data per the field mapping
3. Data is packaged into a portable JSON archive
4. The archive is stored in object storage with time-limited access
5. The user is notified that their export is ready
6. The DSAR request is marked as completed

**Field mapping**: Each new table or user-related field must be added to the DSAR field mapping (or explicitly excluded with a documented reason).

---

## Retention

**Implementation**: `apps/worker/src/jobs/retention.ts`

| Data Type | Retention Policy | Sweep Strategy |
|---|---|---|
| Published outbox events | 7 days | Worker retention job (`runRetentionJob`) |
| Session data | TTL-based | Redis key expiry (automatic) |
| Presence keys | 60 seconds | Redis TTL (auto-expiry, no manual sweep) |
| Typing keys | 8 seconds | Redis TTL (auto-expiry, no manual sweep) |
| Refresh tokens (expired/revoked) | 30 days after expiry/revocation | Worker retention job (`deleteExpired`) |
| Invite codes | Kept for audit; expired cleaned after 90d | Worker retention job (future) |
| Deletion request records | 90 days after completion | Worker retention job (future) |
| DSAR export archives | 30 days after generation | Worker retention job + object storage cleanup (future) |

### DSAR Field Mapping

| Table | Fields Exported | Excluded | Reason for Exclusion |
|---|---|---|---|
| `users` | id, username, display_name, created_at, updated_at | password_hash | Security credential, not user data |
| `refresh_tokens` | — | all | Technical security data, no user-facing content |
| `invite_codes` | — | all | Operational access-control artifacts |
| `outbox_events` | — | all | System infrastructure, not user data |
| `servers` | id, name, created_at | owner_id only if user is owner | Server metadata, minimal PII |
| `channels` | id, name, type, position, created_at | — | No direct user PII |
| `members` | server_id, role, created_at | — | Cascade-deleted with user, role is functional data |
| `server_invites` | — | all | Operational access-control artifacts |
| `messages` | id, channel_id, content, created_at | author_id only if user is author | Message content is user data |
| `attachments` | id, filename, content_type, size_bytes, created_at, server_id, channel_id, message_id | object_key, download URLs | Metadata only; object key excluded (internal path); no permanent URLs |

**Attachment Deletion Propagation**:
- User deletion: `uploader_id` set to NULL (ON DELETE SET NULL)
- Server deletion: worker processes outbox event, soft-deletes attachments, purges object storage
- Object storage cleanup: worker deletes MinIO objects by `object_key` when attachment/server deleted

New tables and fields must document their retention approach before merging.

---

## Logging Policy

- **Safe logger wrapper**: all logging goes through `@sovran/shared` createLogger, which strips PII keys by default
- **Forbidden in logs**: message content, attachment content, tokens, passwords, email addresses, IP addresses, device IDs, session IDs
- **Structured output**: JSON format via pino for machine-parseable log aggregation
- **OpenTelemetry traces**: carry only non-PII identifiers (userId as opaque UUID, serverId, channelId) — never payload content

---

## Data Minimization

- Store only what is necessary for core functionality
- IP addresses are **not stored** unless required for abuse prevention — if stored, document:
  - Purpose
  - Retention period
  - Minimization approach (e.g., truncation, hashing)
- No third-party analytics or telemetry without explicit user opt-in and documentation
- Prefer derived/computed values over storing additional PII
- Ephemeral data (presence, typing) uses Redis TTL and is never persisted to durable storage
