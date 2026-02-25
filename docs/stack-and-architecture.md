# Stack & Architecture (Cursor Reference)

This repository is a GDPR-first Discord-like realtime chat app.
Primary goals: privacy-by-design, security-by-default, testability, and clear modular boundaries.

---

## 1) Recommended Stack (authoritative)

### Frontend
- Web: Next.js + TypeScript
- UI: TailwindCSS + (Radix UI / shadcn/ui)
- Mobile: React Native + TypeScript (later)
- Realtime client: WebSocket + schema validation (zod/typebox)

### Backend
- API: Node.js + Fastify (TypeScript)
- Realtime Gateway: Node.js service using uWebSockets.js
- Worker: Node.js service for async jobs (deletion, retention, DSAR export)
- Pub/Sub fanout: NATS (later JetStream optional)

### Data / Infra
- Database: PostgreSQL (source of truth)
- Cache/Ephemeral: Redis (presence, typing, sessions cache, rate limiting)
- Object storage: S3 compatible (MinIO in dev, EU region in prod)
- Upload scanning: ClamAV pipeline
- Reverse proxy / TLS: Caddy or Traefik
- Secrets/keys: Vault (or KMS), libsodium for app-level field encryption where needed

### Observability (privacy-safe)
- OpenTelemetry instrumentation
- Prometheus + Grafana (metrics)
- Loki (logs)
- Sentry (self-hosted) with PII scrubbing/denylist

---

## 2) Module layout (authoritative)
Preferred structure:

/apps
  /api        # REST endpoints, auth integration, admin tools
  /gateway    # WebSocket gateway, presence, typing, event fanout
  /worker     # async jobs: deletion, retention, DSAR export, purge
/packages
  /domain     # pure business logic (NO IO / NO framework imports)
  /db         # migrations, repositories, DB adapters
  /proto      # single source of truth for API/WS contracts and event schemas
  /shared     # safe logger, error types, config, utilities
/docs
  stack-and-architecture.md
  compliance.md
  threat-model.md

### Boundary rules
- `packages/domain` MUST NOT import from any `apps/*`, db clients, redis, S3, HTTP, WebSocket libraries.
- All IO must be in adapters: `packages/db`, `apps/api`, `apps/gateway`, `apps/worker`.
- `packages/proto` is the ONLY place where event names/payloads are defined.

---

## 3) Core domain concepts (names may evolve, keep stable IDs)
- User: account identity (minimal PII, separate from content where feasible)
- Server: a tenant-like workspace
- Channel: belongs to Server
- Membership: user membership in server with roles
- Role/Permission: RBAC + channel overwrites
- Message: channel-scoped content with edits/deletes
- Attachment: metadata only in DB; content in object storage

---

## 4) Realtime event protocol (rules)
- WebSocket events MUST be defined in `packages/proto`.
- Do NOT invent new event names in gateway code.
- Events must be versioned if breaking changes are required.
- Assume at-least-once delivery; all client mutations include a stable `clientMutationId` (or similar) for dedupe.
- Presence/typing are ephemeral with TTL and MUST NOT be persisted.

---

## 5) NATS Subject Conventions (authoritative)

Gateway fanout subjects:

| Subject Pattern | Purpose |
|---|---|
| `srv.<serverId>.chan.<channelId>.events` | Channel events (messages, reactions, etc.) |
| `srv.<serverId>.presence` | Server presence updates |
| `user.<userId>.dm.events` | Direct message events (future) |
| `srv.>` | Wildcard for all server events (gateway subscription) |

---

## 6) GDPR / Privacy-by-design requirements
### Non-negotiables
- NEVER log message text, attachment content, tokens, emails, IP addresses, device identifiers, session IDs or other PII.
- Avoid storing IP addresses; if required for abuse prevention, document purpose + retention + minimization.
- No third-party analytics/telemetry by default; only opt-in and documented if added.

### Right to erasure
Every new feature that stores user-related data MUST define:
- what gets deleted vs anonymized
- how deletion propagates to:
  - Postgres
  - Redis caches/streams
  - object storage (attachments)
  - search indexes (if introduced later)
- deletion must be idempotent (safe to retry)

### DSAR export
Any new user-related field must be:
- included in DSAR export, OR
- explicitly excluded with a documented reason

### Retention
Any new table/field must have:
- retention policy (if any)
- worker sweep strategy
- strategy for derived copies (indexes/materialized views)

---

## 7) Data layer rules (Postgres is source of truth)
- Every schema change requires a migration in `packages/db/migrations`.
- Prefer backward-compatible migrations:
  - add nullable columns first
  - backfill via worker
  - enforce constraints later
- Add indexes for new access patterns.
- Redis is cache/ephemeral only; never rely on it as the sole store of record.

---

## 8) Attachment pipeline (authoritative)
- Upload initiation returns pre-signed URL.
- Validate: content-type, size, and metadata.
- Store only metadata in DB.
- Scan uploads with ClamAV before making them available.
- Deleting messages/users MUST delete associated objects from storage.

---

## 9) Observability rules (privacy-safe)
- Use the shared safe logger wrapper (redaction built in).
- Never log WS payloads or request bodies.
- Use metrics for operational insight.
- Traces must not include payload content; only non-PII IDs.

---

## 10) Scaling Architecture

| Aspect | Strategy |
|---|---|
| **Stateless Gateway** | Connection state only in memory, presence/typing in Redis with TTL, cross-instance fanout via NATS |
| **Snowflake IDs** | 64-bit IDs with custom epoch (2024-01-01), 10-bit nodeId, 12-bit sequence |
| **At-least-once delivery** | Event envelopes with eventId, client writes with clientMutationId, Redis-based dedupe store |
| **Outbox pattern** | `outbox_events` table, transactional writes, worker publishes to NATS |
| **Partitioning-ready** | serverId as tenant key, time-based indexes on messages (future) |
| **Backpressure** | Max payload size, per-connection rate limit, slow consumer policy (drop/close) |

---

## 11) Definition of Done (for any PR / Cursor task)
- Tests added/updated; all tests pass
- Lint/typecheck pass
- Migrations included if schema changed
- Contracts updated first (proto), then implementation
- Compliance docs updated for any privacy/security behavior changes

END.
