import { describe, expect, it } from 'vitest';

import { MainFrameScriptRequests } from '../tests/script-request-tracker';

function tracker() {
  return new MainFrameScriptRequests({ frameTree: { frame: { id: 'main', loaderId: 'first' } } });
}
function started(id: string, loaderId: string, type = 'Script', frameId = 'main') {
  return {
    requestId: id,
    loaderId,
    type,
    frameId,
    request: { method: 'GET', url: 'https://shell.example/same.js' },
  };
}
function navigated(loaderId: string, id = 'main', parentId?: string) {
  return { frame: { id, loaderId, parentId } };
}

describe('authoritative main-frame script lifetimes', () => {
  it('retires an abandoned old loader after replacement while preserving a concurrent same-URL new script', () => {
    const scripts = tracker();
    scripts.started(started('old', 'first'));
    scripts.started(started('new', 'second'));
    expect(scripts.navigated(navigated('second'))).toBe(true);
    expect(scripts.pending().map((request) => request.requestId)).toEqual(['new']);
    expect(scripts.settled({ requestId: 'old' })).toBe(false);
    expect(scripts.settled({ requestId: 'new' })).toBe(true);
    expect(scripts.pending()).toEqual([]);
  });

  it('preserves live scripts across same-document navigation and redirects until commit or their own terminal event', () => {
    const scripts = tracker();
    scripts.started(started('live', 'first'));
    expect(scripts.navigated(navigated('first'))).toBe(false);
    scripts.started({
      ...started('live', 'first'),
      request: { method: 'GET', url: 'https://shell.example/redirected.js' },
    });
    expect(scripts.pending()).toMatchObject([
      { requestId: 'live', url: 'https://shell.example/redirected.js' },
    ]);
    expect(scripts.settled({ requestId: 'live' })).toBe(true);
  });

  it('never retires unknown loaders, another frame, or a loader that was not the confirmed predecessor', () => {
    const scripts = tracker();
    scripts.started(started('unknown', ''));
    scripts.started(started('unconfirmed', 'different'));
    expect(scripts.started(started('iframe', 'first', 'Script', 'child'))).toBe(false);
    expect(scripts.navigated(navigated('child-next', 'child', 'main'))).toBe(false);
    expect(scripts.navigated(navigated(''))).toBe(false);
    expect(scripts.navigated(navigated('second'))).toBe(false);
    expect(scripts.pending().map((request) => request.requestId)).toEqual([
      'unknown',
      'unconfirmed',
    ]);
  });

  it.each(['Fetch', 'XHR', 'Document'])(
    'leaves %s lifetime to the existing Playwright guard',
    (type) => {
      const scripts = tracker();
      expect(scripts.started(started('api', 'first', type))).toBe(false);
      scripts.navigated(navigated('second'));
      expect(scripts.pending()).toEqual([]);
    }
  );
});
