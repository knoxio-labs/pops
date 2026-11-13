import { UploadJournal } from './durable-upload-journal';

import type { UploadPersistenceIdentity, UploadPersistenceLease } from '@pops/pillar-sdk';

import type { UploadJournalContext } from './durable-upload-journal';

/** Real journal and scoped lease controls shared by upload workflow tests. */
export interface TestUploadJournal {
  journal: UploadJournal;
  reload(): UploadJournal;
  storage: Map<string, string>;
  lease: UploadPersistenceLease;
  failWrites(): void;
  retire(): void;
}

interface LeaseState {
  storage: Map<string, string>;
  identity: UploadPersistenceIdentity;
  prefix: string;
  current: boolean;
  writeFailure: boolean;
}

function assertCurrent(state: LeaseState): void {
  if (!state.current) throw new Error('The test account epoch has retired.');
}

function invalidate(state: LeaseState): void {
  if (!state.current) return;
  state.current = false;
  for (const key of state.storage.keys())
    if (key.startsWith(state.prefix)) state.storage.delete(key);
}

function createLease(state: LeaseState): UploadPersistenceLease {
  return {
    identity: state.identity,
    isCurrent: (): boolean => state.current,
    invalidate: (): void => invalidate(state),
    verify: async (): Promise<void> => {
      assertCurrent(state);
    },
    keys: (): string[] => {
      assertCurrent(state);
      return [...state.storage.keys()]
        .filter((key) => key.startsWith(state.prefix))
        .map((key) => key.slice(state.prefix.length));
    },
    read: (key): string | null => {
      assertCurrent(state);
      return state.storage.get(state.prefix + key) ?? null;
    },
    write: (key, value): void => {
      assertCurrent(state);
      if (state.writeFailure) throw new Error('Journal storage write failed.');
      state.storage.set(state.prefix + key, value);
    },
    remove: (key): void => {
      assertCurrent(state);
      state.storage.delete(state.prefix + key);
    },
  };
}

/** Real journal with a controlled account-scoped storage lease for upload workflow tests. */
export function createTestUploadJournal(
  context?: Partial<UploadJournalContext>,
  principal?: Partial<UploadPersistenceIdentity>
): TestUploadJournal {
  const identity = {
    account: 'account-a',
    server: 'https://owner-a.test',
    epoch: 'epoch-a',
    ...principal,
  };
  const state: LeaseState = {
    storage: new Map(),
    identity,
    prefix: `${JSON.stringify(identity)}:`,
    current: true,
    writeFailure: false,
  };
  const lease = createLease(state);
  const exactContext: UploadJournalContext = {
    tripId: 7,
    tripsOrigin: 'https://trips.test',
    documentsOrigin: 'https://owner-a.test/documents-api',
    target: null,
    ...context,
  };
  return {
    journal: new UploadJournal(lease, exactContext),
    reload: (): UploadJournal => new UploadJournal(lease, exactContext),
    storage: state.storage,
    lease,
    failWrites: (): void => {
      state.writeFailure = true;
    },
    retire: (): void => invalidate(state),
  };
}
