import { describe, expect, it } from 'vitest';

import { UploadJournal } from './durable-upload-journal';

import type { UploadPersistenceIdentity, UploadPersistenceLease } from '@pops/pillar-sdk';

import type { DurableUploadInput } from './durable-upload-api';
import type { UploadJournalContext } from './durable-upload-journal';

const context: UploadJournalContext = {
  tripId: 7,
  tripsOrigin: 'https://trips.test',
  documentsOrigin: 'https://documents.test',
  target: { kind: 'stay', id: 8 },
};
const identity: UploadPersistenceIdentity = {
  account: 'account-a',
  server: 'server-a',
  epoch: 'epoch-a',
};

function input(operationId = 'ab88a8e8-f685-4d47-8d4c-a7e3eb8fdb08'): DurableUploadInput {
  return {
    operationId,
    fileName: 'booking.pdf',
    mimeType: 'application/pdf',
    byteLength: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
}

function host(
  storage = new Map<string, string>(),
  principal: UploadPersistenceIdentity = identity
) {
  let current = true;
  let activeIdentity = { ...principal };
  let writeFails = false;
  let dropWrite = false;
  let removeFails = false;
  let rejectVerification = false;
  let retireOnVerification = false;
  let verifies = 0;
  const scoped = (key: string) => JSON.stringify([principal.account, principal.server, key]);
  const lease: UploadPersistenceLease = {
    get identity() {
      return activeIdentity;
    },
    isCurrent: () => current,
    invalidate: () => {
      if (JSON.stringify(activeIdentity) !== JSON.stringify(principal)) return;
      current = false;
      const prefix = `${JSON.stringify([principal.account, principal.server]).slice(0, -1)},`;
      for (const key of storage.keys()) if (key.startsWith(prefix)) storage.delete(key);
    },
    keys: () => {
      const prefix = `${JSON.stringify([principal.account, principal.server]).slice(0, -1)},`;
      return [...storage.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => {
          const decoded: unknown = JSON.parse(key);
          if (!Array.isArray(decoded) || typeof decoded[2] !== 'string')
            throw new Error('Invalid test key.');
          return decoded[2];
        });
    },
    read: (key) => storage.get(scoped(key)) ?? null,
    write: (key, value) => {
      if (writeFails) throw new Error('Storage write failed.');
      if (!dropWrite) storage.set(scoped(key), value);
    },
    remove: (key) => {
      if (removeFails) throw new Error('Storage removal failed.');
      storage.delete(scoped(key));
    },
    verify: async () => {
      verifies += 1;
      if (rejectVerification) throw new Error('Unknown principal.');
      if (retireOnVerification) current = false;
    },
  };
  return {
    lease,
    storage,
    seed: (payload: string) =>
      storage.set(scoped(`${JSON.stringify(context)}:${input().operationId}`), payload),
    retire: () => {
      current = false;
    },
    replaceEpoch: () => {
      activeIdentity = { ...principal, epoch: 'epoch-b' };
    },
    failWrites: () => {
      writeFails = true;
    },
    loseWrites: () => {
      dropWrite = true;
    },
    failRemovals: () => {
      removeFails = true;
    },
    failVerification: () => {
      rejectVerification = true;
    },
    restoreVerification: () => {
      rejectVerification = false;
    },
    retireOnVerify: () => {
      retireOnVerification = true;
    },
    verifies: () => verifies,
  };
}

it('reloads exact immutable metadata in the same verified account and context without File bytes or receipts', () => {
  const owner = host();
  const first = new UploadJournal(owner.lease, context);
  const descriptor = input();
  first.admit(descriptor);
  const reloaded = new UploadJournal(owner.lease, structuredClone(context));
  expect(reloaded.list()).toEqual([descriptor]);
  expect([...owner.storage.values()].map((value): unknown => JSON.parse(value))).toEqual([
    { version: 1, context, input: descriptor },
  ]);
  descriptor.fileName = 'changed.pdf';
  expect(reloaded.list()[0]?.fileName).toBe('booking.pdf');
  const detached = reloaded.list()[0];
  if (detached === undefined) throw new Error('Missing journal entry.');
  detached.fileName = 'Changed externally.pdf';
  expect(first.list()[0]?.fileName).toBe('booking.pdf');
});

it('reads current storage before each mutation so multiple journal instances preserve independent entries', () => {
  const owner = host();
  const first = new UploadJournal(owner.lease, context);
  const second = new UploadJournal(owner.lease, context);
  const a = input();
  const b = input('cbaa52e9-cc27-4c6a-a315-166f65c40d8c');
  first.admit(a);
  second.admit(b);
  expect(first.list()).toEqual([a, b]);
  first.complete(a.operationId);
  expect(second.list()).toEqual([b]);
  second.complete('ec3abdcf-38b5-4f39-b09f-f600131fb11d');
  expect(first.list()).toEqual([b]);
  second.complete(b.operationId);
  expect(first.list()).toEqual([]);
  expect(owner.storage.size).toBe(0);
});

it.each([
  { tripId: 9 },
  { tripsOrigin: 'https://other-trips.test' },
  { documentsOrigin: 'https://other-documents.test' },
  { target: { kind: 'event', id: 8 } },
  { target: { kind: 'stay', id: 9 } },
  { target: null },
] satisfies Partial<UploadJournalContext>[])(
  'isolates exact context identity %j and completes only its own entry',
  (changed) => {
    const owner = host();
    const first = new UploadJournal(owner.lease, context);
    const second = new UploadJournal(owner.lease, { ...context, ...changed });
    first.admit(input());
    expect(second.list()).toEqual([]);
    second.admit(input());
    second.complete(input().operationId);
    expect(first.list()).toEqual([input()]);
  }
);

it.each([
  { ...identity, account: 'account-b' },
  { ...identity, server: 'server-b' },
])('isolates host account/server authority %j', (principal) => {
  const storage = new Map<string, string>();
  const a = host(storage);
  const b = host(storage, principal);
  const first = new UploadJournal(a.lease, context);
  const second = new UploadJournal(b.lease, context);
  first.admit(input());
  expect(second.list()).toEqual([]);
  second.complete(input().operationId);
  expect(first.list()).toEqual([input()]);
});

it('rejects retired epochs before list, admission, completion or verification without changing storage', async () => {
  const owner = host();
  const journal = new UploadJournal(owner.lease, context);
  journal.admit(input());
  const before = [...owner.storage];
  owner.retire();
  expect(() => journal.assertCurrent()).toThrow();
  expect(() => journal.list()).toThrow();
  expect(() => journal.admit(input())).toThrow();
  expect(() => journal.complete(input().operationId)).toThrow();
  await expect(journal.verify()).rejects.toThrow();
  expect(owner.verifies()).toBe(1);
  expect([...owner.storage]).toEqual(before);
});

it('rejects unknown principals and stale completions of asynchronous verification', async () => {
  expect(
    () => new UploadJournal(host(new Map(), { ...identity, account: '' }).lease, context)
  ).toThrow();
  const unavailable = host();
  const first = new UploadJournal(unavailable.lease, context);
  unavailable.failVerification();
  await expect(first.verify()).rejects.toThrow('Unknown principal');
  expect(() => first.admit(input())).toThrow();
  expect(unavailable.storage.size).toBe(0);
  const retired = host();
  const second = new UploadJournal(retired.lease, context);
  retired.retireOnVerify();
  await expect(second.verify()).rejects.toThrow();
  expect(() => second.admit(input())).toThrow();
  expect(retired.storage.size).toBe(0);
});

it('reverifies current server authority without replacing journal identity', async () => {
  const owner = host();
  const journal = new UploadJournal(owner.lease, context);
  await expect(journal.verify()).resolves.toBeUndefined();
  expect(owner.verifies()).toBe(1);
});

it.each(['throw', 'lost'])(
  'refuses to admit an operation when its storage write is %s',
  (failure) => {
    const owner = host();
    const journal = new UploadJournal(owner.lease, context);
    if (failure === 'throw') owner.failWrites();
    else owner.loseWrites();
    expect(() => journal.admit(input())).toThrow();
    expect(journal.list()).toEqual([]);
  }
);

it('reports failed storage removal and preserves the entry', () => {
  const owner = host();
  const journal = new UploadJournal(owner.lease, context);
  journal.admit(input());
  owner.failRemovals();
  expect(() => journal.complete(input().operationId)).toThrow();
  expect(journal.list()).toEqual([input()]);
});

it.each([
  { fileName: 'other.pdf' },
  { title: 'Other' },
  { mimeType: 'image/png' },
  { byteLength: 4 },
  { sha256: 'b'.repeat(64) },
])('rejects changed immutable input for an existing UUID: %j', (changed) => {
  const owner = host();
  const journal = new UploadJournal(owner.lease, context);
  journal.admit(input());
  expect(() => journal.admit({ ...input(), ...changed })).toThrow();
  expect(journal.list()).toEqual([input()]);
  journal.admit(input());
  expect(journal.list()).toEqual([input()]);
});

describe.each([
  ['malformed JSON', '{'],
  ['unsupported version', JSON.stringify({ version: 2, context, input: input() })],
  ['missing input', JSON.stringify({ version: 1, context })],
  [
    'wrong context',
    JSON.stringify({ version: 1, context: { ...context, tripId: 10 }, input: input() }),
  ],
  ['extra field', JSON.stringify({ version: 1, context, input: input(), taskId: 'unchecked' })],
  [
    'invalid input',
    JSON.stringify({ version: 1, context, input: { ...input(), operationId: 'bad' } }),
  ],
  ['unchecked input', JSON.stringify({ version: 1, context, input: { ...input(), bytes: 'abc' } })],
  [
    'wrong key UUID',
    JSON.stringify({ version: 1, context, input: input('cbaa52e9-cc27-4c6a-a315-166f65c40d8c') }),
  ],
  ['unsupported collection', JSON.stringify({ version: 1, context, entries: [input(), input()] })],
])('corrupt journal: %s', (_name, stored) => {
  it('fails closed without silently resetting or overwriting the payload', () => {
    const owner = host();
    owner.seed(stored);
    const journal = new UploadJournal(owner.lease, context);
    const before = [...owner.storage];
    expect(() => journal.list()).toThrow();
    expect(() => journal.admit(input())).toThrow();
    expect(() => journal.complete(input().operationId)).toThrow();
    expect([...owner.storage]).toEqual(before);
  });
});

it('rejects an identity epoch replacement even if the host still reports the lease current', () => {
  const owner = host();
  const journal = new UploadJournal(owner.lease, context);
  journal.admit(input());
  const before = [...owner.storage];
  owner.replaceEpoch();
  expect(() => journal.list()).toThrow();
  expect(() => journal.admit(input())).toThrow();
  expect(() => journal.complete(input().operationId)).toThrow();
  expect([...owner.storage]).toEqual(before);
});

it('permits explicit fresh verification after a transient failure while metadata stays quarantined', async () => {
  const owner = host();
  const journal = new UploadJournal(owner.lease, context);
  journal.admit(input());
  owner.failVerification();
  await expect(journal.verify()).rejects.toThrow();
  expect(() => journal.list()).toThrow();
  owner.restoreVerification();
  expect(() => journal.list()).toThrow();
  await expect(journal.verify()).resolves.toBeUndefined();
  expect(journal.list()).toEqual([input()]);
  owner.replaceEpoch();
  await expect(journal.verify()).rejects.toThrow();
  expect(() => journal.list()).toThrow();
});

it('retires and purges its captured scope when authorization is invalidated', () => {
  const owner = host();
  const journal = new UploadJournal(owner.lease, context);
  journal.admit(input());
  journal.invalidate();
  expect(owner.storage.size).toBe(0);
  expect(() => journal.list()).toThrow();
  expect(() => journal.admit(input())).toThrow();
});

it('refuses optional owner titles and arbitrary composer text instead of persisting unapproved metadata', () => {
  const owner = host();
  const journal = new UploadJournal(owner.lease, context);
  expect(() => journal.admit({ ...input(), title: 'Composer text' })).toThrow();
  expect(journal.list()).toEqual([]);
  expect(owner.storage.size).toBe(0);
});

it('keeps interleaved admissions on separate operation keys instead of overwriting a shared collection', () => {
  const owner = host();
  const a = input();
  const b = input('cbaa52e9-cc27-4c6a-a315-166f65c40d8c');
  const second = new UploadJournal(owner.lease, context);
  let interleaved = false;
  const lease: UploadPersistenceLease = {
    ...owner.lease,
    write: (key, value) => {
      if (!interleaved) {
        interleaved = true;
        second.admit(b);
      }
      owner.lease.write(key, value);
    },
  };
  const first = new UploadJournal(lease, context);
  first.admit(a);
  expect(first.list()).toEqual(expect.arrayContaining([a, b]));
  expect(first.list()).toHaveLength(2);
  expect(owner.storage.size).toBe(2);
  second.complete(b.operationId);
  expect(first.list()).toEqual([a]);
});
