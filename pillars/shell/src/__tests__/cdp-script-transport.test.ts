import { describe, expect, it } from 'vitest';

import { ScriptCdpTransport } from '../tests/cdp-script-transport';
import { inspectCdpMessage } from '../tests/cdp-script-types';

function fixture() {
  let receive: (data: unknown) => void = () => {
    throw new Error('Missing receiver');
  };
  let disconnected: (reason: string) => void = () => {
    throw new Error('Missing close listener');
  };
  const sent: object[] = [];
  const delivered: object[] = [];
  let closed = 0;
  const transport = new ScriptCdpTransport({
    send: (data) => sent.push(JSON.parse(data)),
    close: () => {
      closed++;
    },
    onMessage: (listener) => {
      receive = listener;
    },
    onClose: (listener) => {
      disconnected = listener;
    },
    onError: () => undefined,
  });
  transport.onmessage = (message) => delivered.push(message);
  const incoming = (message: object) => receive(JSON.stringify(message));
  incoming({
    method: 'Target.attachedToTarget',
    params: {
      sessionId: 'page',
      waitingForDebugger: true,
      targetInfo: { type: 'page', targetId: 'target', browserContextId: 'context' },
    },
  });
  const page = transport.observations.observe(
    { type: 'page', targetId: 'target', browserContextId: 'context' },
    () => undefined
  );
  incoming({
    method: 'Target.attachedToTarget',
    sessionId: 'page',
    params: {
      sessionId: 'worker',
      waitingForDebugger: true,
      targetInfo: { type: 'worker', targetId: 'bootstrap' },
    },
  });
  const setup = () => {
    transport.send({ id: 1, sessionId: 'worker', method: 'Network.enable' });
    transport.send({ id: 2, sessionId: 'worker', method: 'Runtime.runIfWaitingForDebugger' });
    transport.send({
      id: 3,
      sessionId: 'worker',
      method: 'Target.setAutoAttach',
      params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
    });
  };
  return {
    transport,
    page,
    sent,
    delivered,
    incoming,
    malformed: (data: unknown) => receive(data),
    setup,
    disconnected,
    closed: () => closed,
    sentIds: () => sent.map((message) => inspectCdpMessage(message).id),
  };
}

describe('sole CDP worker startup connection', () => {
  it('holds the actual resume until both actual same-session replies arrive', () => {
    const f = fixture();
    f.setup();
    expect(f.sentIds()).toEqual([1, 3]);
    f.incoming({ id: 3, sessionId: 'worker', result: {} });
    expect(f.sentIds()).toEqual([1, 3]);
    f.incoming({ id: 1, sessionId: 'worker', result: {} });
    expect(f.sent).toEqual([
      { id: 1, sessionId: 'worker', method: 'Network.enable' },
      {
        id: 3,
        sessionId: 'worker',
        method: 'Target.setAutoAttach',
        params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
      },
      { id: 2, sessionId: 'worker', method: 'Runtime.runIfWaitingForDebugger' },
    ]);
    expect(f.closed()).toBe(0);
  });

  it('forwards a real error unchanged and keeps the failed page visible without poisoning another page', () => {
    const f = fixture();
    f.setup();
    f.incoming({
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'other',
        waitingForDebugger: true,
        targetInfo: { type: 'page', targetId: 'other', browserContextId: 'different' },
      },
    });
    const other = f.transport.observations.observe(
      { type: 'page', targetId: 'other', browserContextId: 'different' },
      () => undefined
    );
    const error = {
      id: 1,
      sessionId: 'worker',
      error: { code: -32000, message: 'Network enable refused' },
    };
    f.incoming(error);
    f.incoming({ id: 3, sessionId: 'worker', result: {} });
    expect(f.delivered.at(-2)).toEqual(error);
    expect(f.sentIds()).toEqual([1, 3]);
    expect(() => f.page.assertHealthy()).toThrow('Browser script observation failed');
    expect(() => other.assertHealthy()).not.toThrow();
    expect(f.closed()).toBe(0);
  });

  it('never lends a dead session late acknowledgements or invents a resume reply', () => {
    const f = fixture();
    f.setup();
    f.incoming({
      method: 'Target.detachedFromTarget',
      sessionId: 'page',
      params: { sessionId: 'worker' },
    });
    f.incoming({ id: 1, sessionId: 'worker', result: {} });
    f.incoming({ id: 3, sessionId: 'worker', result: {} });
    expect(f.sentIds()).toEqual([1, 3]);
    expect(f.delivered.some((message) => inspectCdpMessage(message).id === 2)).toBe(false);
    expect(() => f.page.assertHealthy()).toThrow();
  });

  it('preserves socket loss and queued startup failure', () => {
    const f = fixture();
    f.setup();
    let reason: string | undefined;
    f.transport.onclose = (value) => {
      reason = value;
    };
    f.disconnected('socket lost');
    expect(reason).toBe('socket lost');
    expect(() => f.page.assertHealthy()).toThrow();
    expect(f.sentIds()).toEqual([1, 3]);
  });

  it.each([123, '{invalid json'])(
    'rejects malformed wire data without fabricating protocol replies: %s',
    (data) => {
      const f = fixture();
      const before = f.delivered.length;
      f.malformed(data);
      expect(f.closed()).toBe(1);
      expect(f.delivered).toHaveLength(before);
      expect(() => f.page.assertHealthy()).toThrow();
    }
  );

  it('fails closed on mismatched session acknowledgements', async () => {
    const f = fixture();
    f.setup();
    f.incoming({ id: 1, sessionId: 'other-worker', result: {} });
    await Promise.resolve();
    expect(f.closed()).toBe(1);
    expect(() => f.page.assertHealthy()).toThrow();
    expect(f.sentIds()).toEqual([1, 3]);
  });
});
