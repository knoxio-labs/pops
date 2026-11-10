import { describe, expect, it } from 'vitest';

import { ScriptCdpTransport } from '../tests/cdp-script-transport';
import { inspectCdpMessage } from '../tests/cdp-script-types';

function fixture(parents: readonly ('iframe' | 'worker')[] = []) {
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
  let parentSessionId = 'page';
  for (const [index, type] of parents.entries()) {
    const sessionId = `parent-${index}`;
    incoming({
      method: 'Target.attachedToTarget',
      sessionId: parentSessionId,
      params: {
        sessionId,
        waitingForDebugger: true,
        targetInfo: { type, targetId: `${sessionId}-target` },
      },
    });
    parentSessionId = sessionId;
  }
  incoming({
    method: 'Target.attachedToTarget',
    sessionId: parentSessionId,
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

  it.each([
    { parents: [], ancestor: 'page' },
    { parents: ['iframe'], ancestor: 'page' },
    { parents: ['iframe'], ancestor: 'parent-0' },
    { parents: ['worker', 'iframe'], ancestor: 'page' },
    { parents: ['worker', 'iframe'], ancestor: 'parent-0' },
    { parents: ['worker', 'iframe', 'worker'], ancestor: 'parent-1' },
  ] as const)(
    'invalidates complete ancestry $parents when $ancestor detaches before late replies',
    ({ parents, ancestor }) => {
      const f = fixture(parents);
      f.setup();
      f.incoming({
        method: 'Network.requestWillBeSent',
        sessionId: 'worker',
        params: {
          requestId: 'held-import',
          type: 'Script',
          request: { method: 'GET', url: 'https://example.test/import.js' },
        },
      });
      f.incoming({ method: 'Target.detachedFromTarget', params: { sessionId: ancestor } });
      f.incoming({ id: 1, sessionId: 'worker', result: {} });
      f.incoming({ id: 3, sessionId: 'worker', result: {} });
      expect(f.sentIds()).toEqual([1, 3]);
      expect(() => f.page.assertHealthy()).toThrow();
      expect(f.page.pending().map((request) => request.requestId)).toEqual(['held-import']);
      const lateError = {
        id: 1,
        sessionId: 'worker',
        error: { code: -32000, message: 'Detached' },
      };
      f.incoming(lateError);
      expect(f.delivered.at(-1)).toEqual(lateError);
      expect(f.sentIds()).toEqual([1, 3]);
    }
  );

  it('cannot revive an iframe descendant from a reply already deferred before ancestor detachment', async () => {
    const f = fixture(['iframe']);
    f.setup();
    let release: () => void = () => {
      throw new Error('Missing release');
    };
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.transport.beforeWorkerReply = async (command) => {
      if (command.id === 1) await held;
    };
    const forwarded = new Promise<void>((resolve) => {
      f.transport.onmessage = (message) => {
        f.delivered.push(message);
        if (inspectCdpMessage(message).id === 1) resolve();
      };
    });
    f.incoming({ id: 1, sessionId: 'worker', result: {} });
    f.incoming({ method: 'Target.detachedFromTarget', params: { sessionId: 'page' } });
    f.incoming({ id: 3, sessionId: 'worker', result: {} });
    release();
    await forwarded;
    expect(f.sentIds()).toEqual([1, 3]);
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
