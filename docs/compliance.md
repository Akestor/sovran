# Compliance & Data Protection

This document describes the GDPR compliance posture of the Sovran platform.
All features must be developed with privacy-by-design and data minimization as defaults.

---

## Data Categories

| Category | Examples | Storage | PII? |
|---|---|---|---|
| **Account data** | userId, display name | PostgreSQL | Minimal PII |
| **Content data** | Messages, attachments | PostgreSQL + object storage | Separate from identity |
| **Ephemeral data** | Presence, typing indicators | Redis with TTL | Not persisted |
| **System data** | Outbox events, migrations | PostgreSQL | No PII |

### Separation principle
Account/identity data is kept separate from content data where possible, minimizing the blast radius of any data breach and simplifying deletion/anonymization.

---

## Right to Erasure (Art. 17)

**Implementation**: `apps/worker/src/jobs/deletion.ts`

When a user exercises their right to erasure:

1. A deletion request is created in the database
2. The deletion worker job processes pending requests
3. Data is deleted or anonymized across all storage layers:
   - **PostgreSQL**: user record anonymized, messages either deleted or author anonymized
   - **Redis cache**: all user-related cache keys purged
   - **Object storage**: all user-uploaded attachments deleted
   - **Search indexes**: user data purged (if search is introduced)
4. The deletion request is marked as completed

**Properties**:
- Idempotent: safe to retry on failure
- Auditable: completion status tracked without storing PII
- Propagation: covers all storage layers systematically

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
| Published outbox events | 7 days (configurable) | Worker retention job deletes expired rows |
| Session data | TTL-based | Redis key expiry (automatic) |
| Refresh tokens | Configurable max lifetime | Worker sweep or Redis TTL |
| Deletion request records | 90 days after completion | Worker retention job |
| DSAR export archives | 30 days after generation | Worker retention job + object storage cleanup |

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
