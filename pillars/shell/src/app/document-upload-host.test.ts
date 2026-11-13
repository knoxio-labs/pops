import { expect, it } from 'vitest';

import { createClient } from '../registry-api/client';
import { createDocumentUploadHost } from './document-upload-host';

import type { SessionGetResponses } from '../registry-api/types.gen';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  fail = false;
  dropWrites = false;
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    if (this.fail) throw new Error('Browser storage unavailable.');
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    if (this.fail) throw new Error('Browser storage unavailable.');
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.fail) throw new Error('Browser storage unavailable.');
    if (!this.dropWrites) this.values.set(key, value);
  }
  snapshot(): [string, string][] {
    return [...this.values];
  }
}

function session(email: string | null): Response {
  const payload: SessionGetResponses[200] = { email, kind: 'operator' };
  return Response.json(payload);
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred session was not initialized.');
  };
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(
  respond: (request: Request) => Response | Promise<Response> = () => session('a@example.test'),
  storage = new MemoryStorage(),
  server = 'https://shell.test'
) {
  const requests: Request[] = [];
  const fetcher: typeof globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init);
    requests.push(request);
    return respond(request);
  };
  const client = createClient({ baseUrl: `${server}/registry-api`, fetch: fetcher });
  const options = { server, client, storage: () => storage };
  const host = createDocumentUploadHost(options);
  return { host, client, storage, requests, reload: () => createDocumentUploadHost(options) };
}

it('uses a fresh canonical session and preserves the same account/server epoch across reload', async () => {
  const owner = fixture();
  const first = await owner.host.verify();
  first.write('context', 'pending metadata');
  const nextHost = owner.reload();
  expect(nextHost.current()).toBeNull();
  const next = await nextHost.verify();
  expect(next.identity).toEqual(first.identity);
  expect(next.read('context')).toBe('pending metadata');
  expect(owner.requests).toHaveLength(2);
  expect(
    owner.requests.every((request) => request.url === 'https://shell.test/registry-api/session')
  ).toBe(true);
  expect(owner.requests.every((request) => request.redirect === 'error')).toBe(true);
  expect(nextHost.problem()).toBeNull();
});

it.each([
  ['LAN session', () => session(null)],
  ['empty identity', () => session('')],
  ['blank identity', () => session('  ')],
  ['malformed schema', () => Response.json({ email: 'a@example.test' })],
  ['malformed JSON', () => new Response('{', { headers: { 'Content-Type': 'application/json' } })],
  [
    'unknown success status',
    () =>
      new Response(JSON.stringify({ email: 'a@example.test', kind: 'operator' }), { status: 201 }),
  ],
  [
    'redirect',
    () => new Response(null, { status: 302, headers: { Location: 'https://other.test' } }),
  ],
  ['service failure', () => new Response('private upstream diagnostics', { status: 503 })],
  [
    'network failure',
    () => {
      throw new Error('private upstream diagnostics');
    },
  ],
] as const)('fails closed for %s without exposing upstream diagnostics', async (_name, respond) => {
  const owner = fixture(respond);
  await expect(owner.host.verify()).rejects.toThrow();
  expect(owner.host.current()).toBeNull();
  expect(owner.host.problem()).toContain('Verify your signed-in account');
  expect(owner.host.problem()).not.toContain('private upstream diagnostics');
  expect(owner.storage.length).toBe(0);
});

it('uses only canonical identity fields from the open Registry session response', async () => {
  const owner = fixture(() =>
    Response.json({ email: 'a@example.test', kind: 'operator', unchecked: 'not retained' })
  );
  const lease = await owner.host.verify();
  expect(lease.identity).toEqual({
    account: 'a@example.test',
    server: 'https://shell.test',
    epoch: expect.any(String),
  });
  expect(JSON.stringify(owner.storage.snapshot())).not.toContain('not retained');
  expect(JSON.stringify(lease.identity)).not.toContain('unchecked');
});

it('quarantines pending metadata during transient failure and restores it only after fresh same-account verification', async () => {
  let unavailable = false;
  const owner = fixture(() =>
    unavailable ? new Response('Unavailable', { status: 503 }) : session('a@example.test')
  );
  const lease = await owner.host.verify();
  lease.write('pending', 'original operation');
  const saved = owner.storage.snapshot();
  unavailable = true;
  await expect(owner.host.verify()).rejects.toThrow();
  expect(owner.host.current()).toBeNull();
  expect(lease.isCurrent()).toBe(false);
  expect(() => lease.read('pending')).toThrow();
  expect(() => lease.write('other', 'forbidden')).toThrow();
  expect(owner.storage.snapshot()).toEqual(saved);
  unavailable = false;
  await expect(lease.verify()).rejects.toThrow();
  await owner.host.verify();
  await expect(lease.verify()).resolves.toBeUndefined();
  expect(lease.isCurrent()).toBe(true);
  expect(lease.read('pending')).toBe('original operation');
});

it('retires all old-account epochs on account changes and never resurrects A after A to B to A', async () => {
  let account = 'a@example.test';
  const owner = fixture(() => session(account));
  const a = await owner.host.verify();
  a.write('pending', 'old A');
  const data = owner.storage.snapshot().find(([key]) => key.includes(':data:'));
  if (data === undefined) throw new Error('Pending metadata was not stored.');
  owner.storage.setItem(
    data[0].replace(a.identity.epoch, 'd76109dc-034f-4428-90d7-d0a829430311'),
    'older epoch'
  );
  account = 'b@example.test';
  const b = await owner.host.verify();
  expect(() => a.read('pending')).toThrow();
  expect(
    owner.storage.snapshot().some(([, value]) => value === 'old A' || value === 'older epoch')
  ).toBe(false);
  b.write('pending', 'B');
  account = 'a@example.test';
  const nextA = await owner.host.verify();
  expect(nextA.identity.epoch).not.toBe(a.identity.epoch);
  expect(nextA.read('pending')).toBeNull();
  expect(() => a.write('pending', 'stale A')).toThrow();
  expect(() => b.remove('pending')).toThrow();
  expect(owner.storage.snapshot().some(([, value]) => value === 'B')).toBe(false);
});

it('purges only the observed account/server on actual HTTP 401 regardless of its body', async () => {
  let unauthorized = false;
  const owner = fixture(() =>
    unauthorized ? new Response('Access denied', { status: 401 }) : session('a@example.test')
  );
  const other = fixture(
    () => session('a@example.test'),
    owner.storage,
    'https://other-server.test'
  );
  const lease = await owner.host.verify();
  const foreign = await other.host.verify();
  lease.write('pending', 'local');
  foreign.write('pending', 'foreign');
  unauthorized = true;
  await expect(owner.host.verify()).rejects.toThrow();
  expect(owner.host.current()).toBeNull();
  expect(() => lease.read('pending')).toThrow();
  expect(owner.storage.snapshot().some(([, value]) => value === 'local')).toBe(false);
  expect(foreign.read('pending')).toBe('foreign');
});

it('does not grant a stale verification authority after a newer verification succeeds', async () => {
  const a = deferred<Response>();
  const b = deferred<Response>();
  let reads = 0;
  const owner = fixture(() => (++reads === 1 ? a.promise : b.promise));
  const old = owner.host.verify();
  const oldOutcome = expect(old).rejects.toThrow();
  const latest = owner.host.verify();
  b.resolve(session('b@example.test'));
  const accepted = await latest;
  accepted.write('pending', 'new B');
  const stored = owner.storage.snapshot();
  a.resolve(session('a@example.test'));
  await oldOutcome;
  expect(owner.host.current()?.identity).toEqual(accepted.identity);
  expect(owner.storage.snapshot()).toEqual(stored);
});

it('invalidates pending verification and prevents late writes or completion after logout', async () => {
  const late = deferred<Response>();
  let delayed = false;
  const owner = fixture(() => (delayed ? late.promise : session('a@example.test')));
  const lease = await owner.host.verify();
  lease.write('pending', 'old operation');
  delayed = true;
  const pending = lease.verify();
  const outcome = expect(pending).rejects.toThrow();
  owner.host.invalidate();
  expect(owner.storage.length).toBe(0);
  late.resolve(session('a@example.test'));
  await outcome;
  expect(owner.host.current()).toBeNull();
  expect(() => lease.write('pending', 'late acknowledgement')).toThrow();
  expect(() => lease.remove('pending')).toThrow();
  expect(owner.storage.length).toBe(0);
});

it('rejects mutable Registry origins before dispatch and after an in-flight session response', async () => {
  const late = deferred<Response>();
  const owner = fixture(() => late.promise);
  const pending = owner.host.verify();
  const outcome = expect(pending).rejects.toThrow();
  owner.client.setConfig({ baseUrl: 'https://owner-b.test/registry-api' });
  late.resolve(session('a@example.test'));
  await outcome;
  await expect(owner.host.verify()).rejects.toThrow();
  expect(owner.requests).toHaveLength(1);
  expect(owner.requests[0]?.url).toBe('https://shell.test/registry-api/session');
  expect(owner.host.current()).toBeNull();
  expect(owner.storage.length).toBe(0);
});

it.each([
  'https://shell.test/path',
  'https://user@shell.test',
  'file:///private',
  'https://shell.test?query=1',
])('rejects non-origin server authority %s', (server) =>
  expect(() => createDocumentUploadHost({ server })).toThrow()
);

it('rereads actual marker state so stale storage events do not purge or invalidate a newer account', async () => {
  let account = 'a@example.test';
  const owner = fixture(() => session(account));
  await owner.host.verify();
  const oldMarker = owner.storage.snapshot().find(([key]) => key.includes(':identity:'));
  if (oldMarker === undefined) throw new Error('Identity marker missing.');
  account = 'b@example.test';
  const current = await owner.host.verify();
  current.write('pending', 'B operation');
  owner.host.handleStorageEvent({
    key: oldMarker[0],
    newValue: oldMarker[1],
    storageArea: owner.storage,
  });
  expect(owner.host.current()?.identity).toEqual(current.identity);
  expect(current.read('pending')).toBe('B operation');
  owner.host.handleStorageEvent({
    key: oldMarker[0],
    newValue: null,
    storageArea: new MemoryStorage(),
  });
  expect(owner.host.current()?.identity).toEqual(current.identity);
  owner.storage.removeItem(oldMarker[0]);
  owner.host.handleStorageEvent({
    key: oldMarker[0],
    newValue: oldMarker[1],
    storageArea: owner.storage,
  });
  expect(owner.host.current()).toBeNull();
  expect(() => current.read('pending')).toThrow();
  expect(owner.storage.snapshot().some(([, value]) => value === 'B operation')).toBe(true);
});

it('rejects marker corruption without resetting stored pending metadata', async () => {
  const owner = fixture();
  const lease = await owner.host.verify();
  lease.write('pending', 'quarantined');
  const marker = owner.storage.snapshot().find(([key]) => key.includes(':identity:'));
  if (marker === undefined) throw new Error('Identity marker missing.');
  owner.storage.setItem(marker[0], '{');
  const before = owner.storage.snapshot();
  await expect(owner.host.verify()).rejects.toThrow();
  expect(owner.storage.snapshot()).toEqual(before);
  expect(owner.host.current()).toBeNull();
  expect(() => lease.read('pending')).toThrow();
});

it.each(['unavailable', 'dropped write'])(
  'refuses to issue a persistence lease when storage is %s',
  async (failure) => {
    const owner = fixture();
    owner.storage.fail = failure === 'unavailable';
    owner.storage.dropWrites = failure === 'dropped write';
    await expect(owner.host.verify()).rejects.toThrow();
    expect(owner.host.current()).toBeNull();
    expect(owner.host.problem()).toContain('browser storage');
  }
);

it('quarantines an active lease when a metadata write fails its readback', async () => {
  const owner = fixture();
  const lease = await owner.host.verify();
  owner.storage.dropWrites = true;
  expect(() => lease.write('pending', 'lost')).toThrow();
  expect(owner.host.current()).toBeNull();
  expect(() => lease.read('pending')).toThrow();
});

it('rejects a pending session after another tab removes its epoch, without recreating the marker', async () => {
  const late = deferred<Response>();
  let pending = false;
  const owner = fixture(() => (pending ? late.promise : session('a@example.test')));
  const lease = await owner.host.verify();
  lease.write('pending', 'retained metadata');
  const marker = owner.storage.snapshot().find(([key]) => key.includes(':identity:'));
  if (marker === undefined) throw new Error('Identity marker missing.');
  pending = true;
  const verification = owner.host.verify();
  const outcome = expect(verification).rejects.toThrow();
  owner.storage.removeItem(marker[0]);
  owner.host.handleStorageEvent({ key: marker[0], newValue: null, storageArea: owner.storage });
  late.resolve(session('a@example.test'));
  await outcome;
  expect(owner.host.current()).toBeNull();
  expect(owner.storage.getItem(marker[0])).toBeNull();
  expect(() => lease.write('pending', 'late metadata')).toThrow();
});

it('does not let a stale A authorization loss purge or invalidate the newer verified B account', async () => {
  const lostAuthorization = deferred<Response>();
  let reads = 0;
  const owner = fixture(() => {
    reads += 1;
    if (reads === 1) return session('a@example.test');
    if (reads === 2) return lostAuthorization.promise;
    return session('b@example.test');
  });
  const a = await owner.host.verify();
  a.write('pending', 'A operation');
  const pendingA = a.verify();
  const outcomeA = expect(pendingA).rejects.toThrow();
  const b = await owner.host.verify();
  b.write('pending', 'B operation');
  const saved = owner.storage.snapshot();
  lostAuthorization.resolve(new Response('Access denied', { status: 401 }));
  await outcomeA;
  a.invalidate();
  expect(owner.host.current()?.identity).toEqual(b.identity);
  expect(b.read('pending')).toBe('B operation');
  expect(owner.storage.snapshot()).toEqual(saved);
  expect(() => a.write('pending', 'late A')).toThrow();
});

it('purges only the captured lease scope when that current lease observes owner authorization loss', async () => {
  const owner = fixture();
  const lease = await owner.host.verify();
  lease.write('pending', 'A operation');
  lease.invalidate();
  expect(owner.host.current()).toBeNull();
  expect(owner.storage.length).toBe(0);
  expect(() => lease.read('pending')).toThrow();
});

it('shares sibling action checks only within an already verified unchanged account and permits both owner steps', async () => {
  const pending = deferred<Response>();
  let delayed = false;
  const owner = fixture(() => (delayed ? pending.promise : session('a@example.test')));
  const lease = await owner.host.verify();
  delayed = true;
  const writes: string[] = [];
  const action = async (operation: string) => {
    await lease.verify();
    lease.write(operation, 'immutable descriptor');
    writes.push(operation);
  };
  const first = action('upload-1');
  const second = action('upload-2');
  await expect.poll(() => owner.requests.length).toBe(2);
  expect(lease.isCurrent()).toBe(true);
  expect(writes).toEqual([]);
  pending.resolve(session('a@example.test'));
  await Promise.all([first, second]);
  expect(writes).toEqual(['upload-1', 'upload-2']);
  expect(lease.keys()).toEqual(expect.arrayContaining(['upload-1', 'upload-2']));
});

it('a new lifecycle generation supersedes both sibling upload checks and never delivers old A under verified B', async () => {
  const old = deferred<Response>();
  const newer = deferred<Response>();
  let reads = 0;
  const owner = fixture(() => {
    reads += 1;
    if (reads === 1) return session('a@example.test');
    if (reads === 2) return old.promise;
    return newer.promise;
  });
  const lease = await owner.host.verify();
  lease.write('pending', 'A descriptor');
  const writes: string[] = [];
  const action = async () => {
    await lease.verify();
    lease.write('resurrected', 'A');
    writes.push('A');
  };
  const first = expect(action()).rejects.toThrow();
  const second = expect(action()).rejects.toThrow();
  const lifecycle = owner.host.verify();
  expect(owner.host.current()).toBeNull();
  expect(() => lease.read('pending')).toThrow();
  newer.resolve(session('b@example.test'));
  const b = await lifecycle;
  b.write('pending', 'B descriptor');
  const snapshot = owner.storage.snapshot();
  old.resolve(session('a@example.test'));
  await Promise.all([first, second]);
  expect(writes).toEqual([]);
  expect(owner.host.current()?.identity).toEqual(b.identity);
  expect(owner.storage.snapshot()).toEqual(snapshot);
  expect(b.read('pending')).toBe('B descriptor');
});

it('immediately blocks metadata access when the configured Registry URL changes without another verify', async () => {
  const owner = fixture();
  const lease = await owner.host.verify();
  lease.write('pending', 'A descriptor');
  const snapshot = owner.storage.snapshot();
  owner.client.setConfig({ baseUrl: 'https://other.test/registry-api' });
  expect(owner.host.current()).toBeNull();
  expect(lease.isCurrent()).toBe(false);
  expect(() => lease.keys()).toThrow();
  expect(() => lease.read('pending')).toThrow();
  expect(() => lease.write('pending', 'foreign')).toThrow();
  expect(() => lease.remove('pending')).toThrow();
  expect(owner.storage.snapshot()).toEqual(snapshot);
  expect(owner.requests).toHaveLength(1);
});

it('requires fresh lifecycle proof after an observed Registry URL A to B to A change', async () => {
  const owner = fixture();
  const lease = await owner.host.verify();
  lease.write('pending', 'A descriptor');
  owner.client.setConfig({ baseUrl: 'https://other.test/registry-api' });
  expect(owner.host.current()).toBeNull();
  owner.client.setConfig({ baseUrl: 'https://shell.test/registry-api' });
  expect(owner.host.current()).toBeNull();
  expect(lease.isCurrent()).toBe(false);
  await expect(lease.verify()).rejects.toThrow();
  expect(owner.requests).toHaveLength(1);
  await owner.host.verify();
  expect(lease.read('pending')).toBe('A descriptor');
  expect(owner.requests).toHaveLength(2);
});
