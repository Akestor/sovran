import { describe, it, expect } from 'vitest';
import { resolveOutboxSubject, NatsSubjects } from '../subjects';

describe('resolveOutboxSubject', () => {
  it('routes channel-scoped events to channel subject', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'MESSAGE_CREATE', {
      serverId: 'srv-1',
      channelId: 'ch-1',
    });
    expect(subject).toBe(NatsSubjects.channelEvents('srv-1', 'ch-1'));
    expect(subject).toBe('srv.srv-1.chan.ch-1.events');
  });

  it('routes CHANNEL_CREATE to channel subject', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'CHANNEL_CREATE', {
      serverId: 'srv-1',
      channelId: 'ch-2',
    });
    expect(subject).toBe('srv.srv-1.chan.ch-2.events');
  });

  it('routes CHANNEL_DELETE to channel subject', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'CHANNEL_DELETE', {
      serverId: 'srv-1',
      channelId: 'ch-2',
    });
    expect(subject).toBe('srv.srv-1.chan.ch-2.events');
  });

  it('routes server-level events to server subject', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'SERVER_MEMBER_JOIN', {
      serverId: 'srv-1',
    });
    expect(subject).toBe(NatsSubjects.serverEvents('srv-1'));
    expect(subject).toBe('srv.srv-1.events');
  });

  it('routes SERVER_DELETE to server subject', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'SERVER_DELETE', {
      serverId: 'srv-1',
    });
    expect(subject).toBe('srv.srv-1.events');
  });

  it('routes SERVER_OWNER_TRANSFERRED to server subject', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'SERVER_OWNER_TRANSFERRED', {
      serverId: 'srv-1',
    });
    expect(subject).toBe('srv.srv-1.events');
  });

  it('routes presence events to presence subject', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'PRESENCE_UPDATE', {
      serverId: 'srv-1',
    });
    expect(subject).toBe(NatsSubjects.serverPresence('srv-1'));
    expect(subject).toBe('srv.srv-1.presence');
  });

  it('routes user events to user subject', () => {
    const subject = resolveOutboxSubject('user', 'usr-1', 'USER_DELETED', {
      userId: 'usr-1',
    });
    expect(subject).toBe(NatsSubjects.userEvents('usr-1'));
    expect(subject).toBe('user.usr-1.events');
  });

  it('falls back to generic subject when meta is missing', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'UNKNOWN_EVENT', {});
    expect(subject).toBe('server.srv-1.UNKNOWN_EVENT');
  });

  it('prefers channel-scoped routing over server-level', () => {
    const subject = resolveOutboxSubject('server', 'srv-1', 'MESSAGE_CREATE', {
      serverId: 'srv-1',
      channelId: 'ch-1',
    });
    expect(subject).toBe('srv.srv-1.chan.ch-1.events');
  });
});
