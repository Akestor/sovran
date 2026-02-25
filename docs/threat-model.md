# Threat Model

This document describes the security posture and threat model for the Sovran platform foundation.

---

## Trust Boundaries

| Boundary | Description |
|---|---|
| Client ↔ Gateway | Untrusted WebSocket connections from public internet |
| Client ↔ API | Untrusted HTTP requests from public internet |
| API ↔ PostgreSQL | Trusted internal network (container network) |
| Gateway ↔ NATS | Trusted internal network |
| Worker ↔ PostgreSQL/NATS | Trusted internal network |
| API ↔ Redis | Trusted internal network |

---

## Threat Categories

### T1: Unauthenticated Access

**Risk**: Clients access resources without valid credentials.

**Mitigations**:
- Authentication required before any data operation (short-lived access tokens + refresh rotation)
- Gateway requires IDENTIFY handshake before event processing
- API enforces auth on every endpoint (except /health)

### T2: Unauthorized Access (Privilege Escalation)

**Risk**: Authenticated users access resources beyond their permissions.

**Mitigations**:
- Server/channel-scoped RBAC checked on every request/event
- Server-side enforcement regardless of client behavior
- Membership validation for all channel operations

### T3: Denial of Service

**Risk**: Clients overwhelm gateway or API with excessive requests.

**Mitigations**:
- Per-connection rate limiting (sliding window, configurable)
- Max payload size enforced at WebSocket level (default 64KB)
- Slow consumer handling (maxBackpressure + drain + idle timeout)
- Body size limit on API (1MB default)
- Rate limiting on sensitive endpoints (login, message send, upload init)

### T4: Data Exfiltration via Logs/Traces

**Risk**: PII leaks through logging, tracing, or error messages.

**Mitigations**:
- Safe logger wrapper strips PII keys by default (passwords, tokens, emails, IPs, session IDs, message content)
- No raw request body or WS payload logging
- Error responses to clients contain only safe error codes and messages
- OpenTelemetry traces carry only non-PII identifiers
- `no-console` ESLint rule prevents accidental console.log usage

### T5: Injection Attacks

**Risk**: SQL injection, XSS, command injection.

**Mitigations**:
- Parameterized queries only (pg client with $1, $2 placeholders)
- Input validation at API/gateway boundary via zod schemas
- No dynamic SQL construction

### T6: Dual-Write Inconsistency

**Risk**: Data written to DB but event not published (or vice versa).

**Mitigations**:
- Outbox pattern: data + event written in single DB transaction
- Worker publishes events from outbox table
- No direct NATS publish after DB write
- At-least-once delivery with clientMutationId for dedupe

### T7: Replay Attacks

**Risk**: Attacker replays captured WebSocket messages.

**Mitigations**:
- clientMutationId for client-initiated mutations (dedupe via Redis TTL)
- Event IDs (Snowflake) for server-side ordering
- Short-lived access tokens with refresh rotation

### T8: Secret Exposure

**Risk**: Secrets committed to repository or leaked in logs.

**Mitigations**:
- All secrets via environment variables (never in code)
- `.env` files in .gitignore
- `.env.example` contains only placeholder values
- Safe logger redacts token/secret/password/authorization keys

### T9: Container Escape / Privilege Escalation

**Risk**: Compromised container gains host access.

**Mitigations**:
- All application containers run as non-root user (sovran, uid 1001)
- Minimal Alpine base images
- No persistent data inside containers
- Read-only filesystem where possible (future)

---

## Data Classification

| Classification | Examples | Handling |
|---|---|---|
| **Public** | Server names, channel names | Standard protection |
| **Internal** | User IDs, server IDs | Non-PII, used in logs/traces |
| **Confidential** | Display names, email addresses | Encrypted at rest (future), DSAR exportable |
| **Restricted** | Passwords, tokens, refresh tokens | Never logged, hashed/encrypted, short-lived |
| **Content** | Messages, attachments | Separate from identity, deletion supported |

---

## Open Items (Foundation Phase)

- TLS termination not yet configured (production requires reverse proxy)
- CORS policy not yet implemented (required before frontend integration)
- Content Security Policy headers not yet set
- Vault/KMS integration for key management not yet implemented
- ClamAV scanning pipeline not yet integrated
