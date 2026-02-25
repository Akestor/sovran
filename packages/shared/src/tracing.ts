/**
 * OpenTelemetry-ready tracing stub.
 *
 * Privacy constraints (per .cursorrules §6):
 * - Traces must NOT include payload content
 * - Only non-PII identifiers (opaque UUIDs, serverIds, channelIds)
 * - No request bodies, WS payloads, or stack traces containing PII
 *
 * When OTel SDK is integrated, replace stubs with real implementations.
 * Expected integration: @opentelemetry/sdk-node + OTLP exporter.
 */

export interface SpanContext {
  traceId: string;
  spanId: string;
  serviceName: string;
}

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
}

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: 'ok' | 'error'): void;
  end(): void;
}

class NoopSpan implements Span {
  setAttribute(_key: string, _value: string | number | boolean): void {
    /* noop */
  }
  setStatus(_status: 'ok' | 'error'): void {
    /* noop */
  }
  end(): void {
    /* noop */
  }
}

class NoopTracer implements Tracer {
  startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): Span {
    return new NoopSpan();
  }
}

let globalTracer: Tracer = new NoopTracer();

export function getTracer(): Tracer {
  return globalTracer;
}

export function setTracer(tracer: Tracer): void {
  globalTracer = tracer;
}

export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
