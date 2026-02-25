# Sovran

GDPR-first, Discord-like realtime communication platform.

Privacy-by-design. Modular monolith. Container-first. Horizontally scalable.

---

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker + Docker Compose

### 1. Setup

```bash
git clone <repo-url> && cd sovran
cp .env.example .env
pnpm install
```

### 2. Start Infrastructure

```bash
pnpm dev:infra          # starts postgres, redis, nats, minio in Docker
```

### 3. Run Migrations

```bash
pnpm db:migrate
```

### 4. Start Application Services

```bash
pnpm dev                # starts api, gateway, worker with hot reload
```

Or individually:

```bash
pnpm dev:api            # Fastify API on :3000
pnpm dev:gateway        # uWebSockets.js gateway on :4000
pnpm dev:worker         # Background worker (outbox publisher + jobs)
```

### 5. Verify

```bash
curl http://localhost:3000/health    # API health
curl http://localhost:4000/health    # Gateway health
```

---

## Full Container Mode

Run everything in Docker (production-like):

```bash
docker compose -f docker-compose.full.yml up --build
```

Stop:

```bash
docker compose -f docker-compose.full.yml down
```

---

## Project Structure

```
apps/
  api/              Fastify HTTP API (auth, admin, CRUD)
  gateway/          uWebSockets.js realtime gateway
  worker/           Background jobs (outbox, deletion, retention, DSAR)
packages/
  domain/           Pure business logic (no IO)
  db/               PostgreSQL migrations + repositories
  proto/            Event schemas + NATS subjects (contracts)
  shared/           Logger, errors, config, ID generator, tracing
docker/
  api.Dockerfile    Multi-stage production build
  gateway.Dockerfile
  worker.Dockerfile
docs/
  architecture.md   System architecture
  stack-and-architecture.md   Authoritative stack reference
  compliance.md     GDPR compliance documentation
  threat-model.md   Security threat model
```

---

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start all services with hot reload |
| `pnpm dev:api` | Start API only |
| `pnpm dev:gateway` | Start gateway only |
| `pnpm dev:worker` | Start worker only |
| `pnpm dev:infra` | Start infrastructure containers |
| `pnpm dev:infra:down` | Stop infrastructure containers |
| `pnpm dev:full` | Full container mode (build + run all) |
| `pnpm build` | Build all packages |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint all code |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm format` | Format code with Prettier |
| `pnpm db:migrate` | Run database migrations |

---

## Architecture Highlights

- **Stateless Gateway**: presence in Redis, fanout via NATS
- **Snowflake IDs**: 64-bit, globally unique, sortable
- **Outbox Pattern**: transactional event publishing via worker
- **At-Least-Once Delivery**: clientMutationId + Redis dedupe
- **PII-Safe Logging**: automatic redaction of sensitive fields
- **Container-First**: dev and prod share the same container model

See [docs/architecture.md](docs/architecture.md) for details.

---

## Compliance

This platform follows GDPR privacy-by-design principles:

- No PII in logs or traces
- Right to erasure (Art. 17) via deletion worker
- DSAR export (Art. 15/20) via export worker
- Data retention enforcement via retention worker
- Data minimization as default posture

See [docs/compliance.md](docs/compliance.md) for details.
