import type { DocumentUploadHostCapability, UploadPersistenceLease } from '@pops/pillar-sdk';

/** Account-scoped in-memory upload metadata authority for source-host tests at one explicit server. */
export function createDocumentUploadHost(server: string): DocumentUploadHostCapability {
  const metadata = new Map<string, string>();
  const listeners = new Set<() => void>();
  let current = true;
  const assertCurrent = (): void => {
    if (!current) throw new Error('The fixture upload account epoch has retired.');
  };
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const invalidate = (): void => {
    current = false;
    metadata.clear();
    notify();
  };
  const lease: UploadPersistenceLease = {
    identity: { account: 'fixture-account', server, epoch: 'fixture-epoch' },
    keys: () => {
      assertCurrent();
      return [...metadata.keys()];
    },
    read: (key) => {
      assertCurrent();
      return metadata.get(key) ?? null;
    },
    write: (key, value) => {
      assertCurrent();
      metadata.set(key, value);
    },
    remove: (key) => {
      assertCurrent();
      metadata.delete(key);
    },
    verify: async () => {
      assertCurrent();
    },
    isCurrent: () => current,
    invalidate,
  };
  return {
    current: () => (current ? lease : null),
    problem: () => (current ? null : 'The fixture upload account epoch has retired.'),
    verify: async () => {
      await lease.verify();
      assertCurrent();
      notify();
      return lease;
    },
    invalidate,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
