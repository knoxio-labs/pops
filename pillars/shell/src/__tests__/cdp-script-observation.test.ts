import { describe, expect, it } from 'vitest';

import { ScriptObservations } from '../tests/cdp-script-observation';

function attach(
  observations: ScriptObservations,
  targetId: string,
  sessionId: string,
  type = 'page',
  parent?: string,
  context = 'context'
) {
  observations.attached(parent, {
    sessionId,
    waitingForDebugger: true,
    targetInfo: { targetId, type, browserContextId: context },
  });
}
function start(
  observations: ScriptObservations,
  session: string,
  id: string,
  loaderId = '',
  frameId = 'main'
) {
  observations.received(session, 'Network.requestWillBeSent', {
    requestId: id,
    loaderId,
    frameId,
    type: 'Script',
    request: { method: 'GET', url: 'https://example.test/same.js' },
  });
}

describe('page/context-scoped script identities', () => {
  it('settles only the owning same-URL bootstrap and session-scoped imports', () => {
    const observations = new ScriptObservations();
    attach(observations, 'one', 'page-one');
    attach(observations, 'two', 'page-two', 'page', undefined, 'other');
    const one = observations.observe(
      { targetId: 'one', type: 'page', browserContextId: 'context' },
      () => undefined
    );
    const two = observations.observe(
      { targetId: 'two', type: 'page', browserContextId: 'other' },
      () => undefined
    );
    attach(observations, 'worker-one', 'worker-one-session', 'worker', 'page-one');
    attach(observations, 'worker-two', 'worker-two-session', 'worker', 'page-two');
    start(observations, 'page-one', 'worker-one');
    start(observations, 'page-two', 'worker-two');
    start(observations, 'worker-one-session', 'same-id');
    start(observations, 'worker-two-session', 'same-id');
    observations.received('worker-one-session', 'Inspector.workerScriptLoaded', {});
    expect(one.pending().map((request) => request.requestId)).toEqual(['same-id']);
    expect(two.pending().map((request) => request.requestId)).toEqual(['worker-two', 'same-id']);
    observations.received('worker-one-session', 'Network.loadingFinished', {
      requestId: 'same-id',
    });
    expect(one.pending()).toEqual([]);
    expect(two.pending()).toHaveLength(2);
    expect(() =>
      observations.observe(
        { targetId: 'two', type: 'page', browserContextId: 'context' },
        () => undefined
      )
    ).toThrow();
  });

  it('preserves unknown loaders and nested imports across worker readiness or detachment', () => {
    const observations = new ScriptObservations();
    attach(observations, 'page', 'page-session');
    observations.frameTree('page-session', {
      frameTree: { frame: { id: 'main', loaderId: 'old' } },
    });
    const page = observations.observe(
      { targetId: 'page', type: 'page', browserContextId: 'context' },
      () => undefined
    );
    start(observations, 'page-session', 'old', 'old');
    start(observations, 'page-session', 'unknown');
    attach(observations, 'root', 'root-session', 'worker', 'page-session');
    attach(observations, 'nested', 'nested-session', 'worker', 'root-session');
    start(observations, 'nested-session', 'child');
    observations.received('nested-session', 'Inspector.workerScriptLoaded', {});
    observations.received('page-session', 'Page.frameNavigated', {
      frame: { id: 'main', loaderId: 'new' },
    });
    expect(page.pending().map((request) => request.requestId)).toEqual(['unknown', 'child']);
    observations.detached('nested-session');
    expect(page.pending()).toHaveLength(2);
    expect(() => page.assertHealthy()).toThrow();
  });

  it('uses actual failed terminals without interpreting URLs', () => {
    const observations = new ScriptObservations();
    attach(observations, 'page', 'page-session');
    const page = observations.observe(
      { targetId: 'page', type: 'page', browserContextId: 'context' },
      () => undefined
    );
    attach(observations, 'worker', 'worker-session', 'worker', 'page-session');
    start(observations, 'page-session', 'worker');
    observations.received('worker-session', 'Network.loadingFailed', { requestId: 'worker' });
    expect(page.pending()).toEqual([]);
    expect(() => page.assertHealthy()).not.toThrow();
  });
});
