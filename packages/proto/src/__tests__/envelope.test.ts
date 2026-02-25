import { describe, it, expect } from 'vitest';
import { createEnvelope, EventEnvelopeSchema, ClientMessageSchema } from '../envelope';
import { NatsSubjects, resolveOutboxSubject } from '../subjects';

describe('EventEnvelope', () => {
  it('creates a valid envelope', () => {
    const env = createEnvelope('evt-1', 'MESSAGE_CREATE', {
      serverId: 'srv-1',
      channelId: 'ch-1',
      payload: { messageId: 'msg-1' },
    });

    expect(env.eventId).toBe('evt-1');
    expect(env.type).toBe('MESSAGE_CREATE');
    expect(env.serverId).toBe('srv-1');
    expect(env.channelId).toBe('ch-1');
    expect(env.payload).toEqual({ messageId: 'msg-1' });
    expect(env.timestamp).toBeTruthy();
  });

  it('validates envelope schema', () => {
    const result = EventEnvelopeSchema.safeParse({
      eventId: '123',
      timestamp: new Date().toISOString(),
      type: 'TEST_EVENT',
      payload: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid envelope', () => {
    const result = EventEnvelopeSchema.safeParse({
      eventId: '',
      timestamp: 'not-a-date',
      type: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('ClientMessage', () => {
  it('validates a client message', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'GATEWAY_HEARTBEAT',
      clientMutationId: 'mut-1',
      payload: {},
    });
    expect(result.success).toBe(true);
  });
});

describe('NatsSubjects', () => {
  it('builds channel event subject', () => {
    expect(NatsSubjects.channelEvents('srv1', 'ch1')).toBe('srv.srv1.chan.ch1.events');
  });

  it('builds server presence subject', () => {
    expect(NatsSubjects.serverPresence('srv1')).toBe('srv.srv1.presence');
  });

  it('builds user events subject', () => {
    expect(NatsSubjects.userEvents('u1')).toBe('user.u1.events');
  });

  it('builds user DM events subject', () => {
    expect(NatsSubjects.userDmEvents('u1')).toBe('user.u1.dm.events');
  });

  it('provides wildcard for all server events', () => {
    expect(NatsSubjects.allServerEvents).toBe('srv.>');
  });
});

describe('resolveOutboxSubject', () => {
  it('resolves channel aggregate to channel events subject', () => {
    const subject = resolveOutboxSubject('channel', 'ch-1', 'MESSAGE_CREATE', {
      serverId: 'srv-1',
      channelId: 'ch-1',
    });
    expect(subject).toBe('srv.srv-1.chan.ch-1.events');
  });

  it('resolves server aggregate to presence subject', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'PRESENCE_UPDATE', {
      serverId: 'srv-1',
    });
    expect(subject).toBe('srv.srv-1.presence');
  });

  it('resolves user aggregate to user events subject', () => {
    const subject = resolveOutboxSubject('user', 'u-1', 'DM_RECEIVED', {
      userId: 'u-1',
    });
    expect(subject).toBe('user.u-1.events');
  });

  it('falls back to generic subject when meta is missing', () => {
    const subject = resolveOutboxSubject('channel', 'ch-1', 'EVENT', {});
    expect(subject).toBe('channel.ch-1.EVENT');
  });
});
