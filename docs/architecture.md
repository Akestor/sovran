# Architecture

## Overview

Sovran is a GDPR-first, Discord-like realtime communication platform built as a modular monolith with clear service boundaries, designed for horizontal scaling from day one.

---

## Module Boundaries

```
/apps
  /api          Fastify HTTP API (auth, admin, CRUD)
  /gateway      uWebSockets.js realtime gateway (events, presence, typing)
  /worker       Background jobs (outbox publisher, deletion, retention, DSAR)
/packages
  /domain       Pure business logic (NO IO, NO framework imports)
  /db           PostgreSQL migrations, repositories, query layer
  /proto        Event schemas, NATS subjects, envelope contracts (single source of truth)
  /shared       Safe logger, AppError, config validation, Snowflake ID, tracing stubs
```

### Dependency Rules

- `packages/domain` → no imports from apps/*, db clients, redis, S3, HTTP, WS
- `packages/proto` → only zod (schema definitions)
- `packages/shared` → pino, zod, @node-rs/argon2, jose, @sovran/domain (type-only for ports)
- `packages/db` → pg, @sovran/shared, @sovran/domain (implements repository ports)
- `apps/gateway` → @sovran/shared, @sovran/proto, @sovran/db (read-only for READY state), @sovran/domain (types only)
- `apps/*` → may import from packages/*, never from other apps/*

---

## Container Strategy

### Dev Mode (preferred developer experience)

Infrastructure runs in Docker Compose, application services run on host with hot reload.

```
docker compose -f docker-compose.dev.yml up -d    # postgres, redis, nats, minio
pnpm dev                                           # api + gateway + worker with tsx watch
```

### Full Container Mode (production-like)

All services run as containers. Same images used in production deployment.

```
docker compose -f docker-compose.full.yml up --build
```

### Dockerfiles

Each application service has a production-ready multi-stage Dockerfile in `docker/`:

| Stage | Purpose |
|---|---|
| `base` | Node 20 Alpine + pnpm via corepack |
| `deps` | Install dependencies with frozen lockfile |
| `build` | Compile TypeScript |
| `runtime` | Minimal image with compiled JS, non-root user, healthcheck |

Security: all containers run as non-root user `sovran` (uid 1001).

---

## Scaling Architecture

### Authentication Flow

1. **Registration**: `POST /auth/register` — requires invite code, returns access + refresh tokens
2. **Login**: `POST /auth/login` — returns access + refresh tokens
3. **Refresh**: `POST /auth/refresh` — rotates refresh token (family-based), detects reuse
4. **Logout**: `POST /auth/logout` — revokes all refresh tokens for user
5. **Me**: `GET /auth/me` — returns authenticated user profile

- Access tokens: short-lived JWT (HS256, default 15min), signed with active KID
- Refresh tokens: opaque random bytes, SHA-256 hashed in DB, family-based rotation
- JWT key rotation: multiple keys supported, verify accepts all, sign uses active KID only
- Password hashing: argon2id via @node-rs/argon2
- Registration gating: invite codes (hashed, TTL, single-use) — no IP logging

### Gateway Authentication

- WebSocket connections require `?token=<JWT>` query parameter on upgrade
- Token verified during HTTP upgrade before WebSocket handshake completes
- Invalid/missing token returns 401 and connection is rejected
- Authenticated userId stored in connection state for authorization checks

### Stateless Gateway

- No persistent state inside gateway process
- Connection metadata is in-memory per instance (session ID, userId, rate limit counters, topic subscriptions)
- Presence stored in Redis with TTL
- Cross-instance event fanout via NATS pub/sub
- Gateway subscribes to `srv.>` wildcard, bridges NATS messages to uWS topic publish
- Read-only DB access for initial state loading (user's server list on connect)

### Gateway READY Flow

On WebSocket connect (after JWT verification):

1. `GATEWAY_HELLO` sent with heartbeat interval
2. User's server memberships fetched from DB (read-only)
3. WebSocket subscribes to uWS topics per server: `srv.<id>.events` + `srv.<id>.chan.*.events`
4. `GATEWAY_READY` sent with `{ sessionId, userId, servers: [{ id, name, role }] }`

This ensures clients receive only events for servers they belong to. Topic subscriptions are automatically cleaned up when the WebSocket closes.

### Server & Channel Management

1. **Create Server**: `POST /servers` — creates server + OWNER membership + #general channel (transactional)
2. **Join Server**: `POST /servers/join` — validates invite code (hashed, TTL, max uses), adds MEMBER role
3. **Leave Server**: `POST /servers/:id/leave` — removes membership (owner cannot leave)
4. **Delete Server**: `DELETE /servers/:id` — soft-delete (owner only), publishes `SERVER_DELETE` event
5. **Create Channel**: `POST /servers/:id/channels` — permission check (ADMIN+), limit check, unique name
6. **Rename Channel**: `PATCH /channels/:id` — permission check (ADMIN+), unique name
7. **Delete Channel**: `DELETE /channels/:id` — permission check (ADMIN+), soft-delete
8. **Create Invite**: `POST /servers/:id/invites` — generates opaque code, stores only SHA-256 hash
9. **Owner Deletion**: deterministic transfer (oldest admin → oldest member → delete server)

### Messaging

1. **Send Message**: `POST /servers/:sid/channels/:cid/messages` — membership + channel check, rate limit (5/5s per user+channel), content validation (max 4000 chars)
2. **List Messages**: `GET /servers/:sid/channels/:cid/messages?before=<id>&limit=50` — cursor-based pagination using Snowflake IDs (DESC order), membership check
3. **Delete Message**: `DELETE /messages/:id` — author can delete own, ADMIN/OWNER can delete any, soft-delete + outbox event

Data flow for realtime delivery:
```
Client → API (validates, writes message + outbox) → Worker (polls outbox)
  → NATS (srv.<serverId>.chan.<channelId>.events)
  → Gateway (bridges NATS to uWS topic)
  → WebSocket clients (subscribed to server topics)
```

Rate limiting: per user+channel sliding window (in-memory, replaceable with Redis for multi-instance)

### Presence & Typing

Presence and typing are **fully ephemeral** — Redis is the source of truth, no Postgres, no Outbox. Events go directly via NATS (no Worker polling needed).

```
Client → Gateway (WS) → Redis (SET with TTL) + NATS (direct publish)
                                                   ↓
                                        Other Gateways (SUB srv.X.presence / srv.X.chan.Y.typing)
                                                   ↓
                                        WebSocket clients
```

**Presence lifecycle:**
- `open`: `presenceStore.setOnline(userId, serverIds)` + NATS publish `PRESENCE_UPDATE(online)` to each server
- `close`: `presenceStore.setOffline(userId)` + NATS publish `PRESENCE_UPDATE(offline)` to each server
- Heartbeat (every 30s): renews Redis TTL (failsafe if gateway crashes without `close`)
- Client event `PRESENCE_STATUS_CHANGE`: user can set `idle`/`dnd`

**Typing lifecycle:**
- Client event `TYPING_START`: `typingStore.setTyping(channelId, userId)` + NATS publish to `srv.<sid>.chan.<cid>.typing`
- 8s TTL in Redis, fire-and-forget (no ACK, no persistence)
- Membership check via `ConnectionState.serverIds`

**Redis key schema:**
- `presence:<userId>` → `{ status, serverIds[] }` with 60s TTL
- `typing:<channelId>:<userId>` → `1` with 8s TTL

**API endpoint:**
- `GET /servers/:serverId/presence` — returns online members with their status (reads from Redis, membership check required)

| Subject | Purpose |
|---|---|
| `srv.<serverId>.presence` | Presence updates |
| `srv.<serverId>.chan.<channelId>.typing` | Typing indicators |
| `srv.<serverId>.chan.*.typing` | Wildcard subscription for typing |

### Snowflake ID Generation

64-bit IDs with:
- Custom epoch: 2024-01-01T00:00:00Z
- 10-bit nodeId (from `NODE_ID` env var, 0–1023)
- 12-bit sequence (4096 IDs per millisecond per node)

Each service instance gets a unique `NODE_ID` to guarantee global uniqueness.

### Event Envelope Standard

Every event contains:
- `eventId` — Snowflake ID for ordering and dedupe
- `timestamp` — ISO 8601 UTC
- `type` — event type string (defined in packages/proto)
- `serverId` / `channelId` / `userId` — scoping (optional)
- `payload` — event-specific data

### At-Least-Once Delivery

- Client mutations include `clientMutationId` for idempotency
- Redis-based dedupe store with TTL (interface in packages/shared)
- Consumers must handle duplicate events gracefully

### Outbox Pattern

Guarantees reliable event delivery:

1. Domain writes data + outbox event in a single DB transaction
2. Worker polls `outbox_events` table for unpublished events
3. Worker publishes to NATS and marks events as published
4. No direct NATS publish after DB write (prevents dual-write problem)

### NATS Subject Conventions

| Subject | Purpose |
|---|---|
| `srv.<serverId>.events` | Server-level events (join, leave, delete, owner transfer) |
| `srv.<serverId>.chan.<channelId>.events` | Channel events (messages, create, delete, rename) |
| `srv.<serverId>.chan.*.events` | Wildcard for all channels in a server |
| `srv.<serverId>.presence` | Server presence updates (direct NATS, no outbox) |
| `srv.<serverId>.chan.<channelId>.typing` | Channel typing indicators (direct NATS, no outbox) |
| `srv.<serverId>.chan.*.typing` | Wildcard for all channel typing in a server |
| `user.<userId>.events` | User-scoped events |
| `user.<userId>.dm.events` | Direct message events |
| `srv.>` | Global wildcard for NATS→uWS bridge |

### Backpressure & Protection

- `maxPayloadLength` on WebSocket (configurable, default 64KB)
- Per-connection sliding window rate limiter
- `maxBackpressure` with drain handler for slow consumers
- Idle timeout (120s) with heartbeat mechanism

---

## Observability

- **Logging**: Structured JSON via pino, PII-stripped by default (safe logger wrapper)
- **Tracing**: OpenTelemetry-ready stubs (noop tracer, replaceable). No payload logging in traces.
- **Metrics**: Stub-ready for Prometheus counters/gauges (not yet instrumented)
- **Request/Event IDs**: Snowflake IDs on all events and requests for correlation

---

## Healthchecks

| Service | Mechanism | Endpoint |
|---|---|---|
| API | HTTP GET | `/health` |
| Gateway | HTTP GET | `/health` |
| Worker | File-based heartbeat | `/tmp/.worker-healthy` (checked every 5s, stale after 30s) |

---

## Data Flow

```
Client → Gateway (uWS) → validates → API (Fastify)
                                        ↓
                                    PostgreSQL (data + outbox_events)
                                        ↓
                                    Worker (polls outbox)
                                        ↓
                                    NATS (publish)
                                        ↓
                                    Gateway (subscribe srv.>)
                                        ↓
                                    Client (WebSocket push)
```
