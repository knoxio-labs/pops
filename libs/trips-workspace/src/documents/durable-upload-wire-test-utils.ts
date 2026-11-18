import { webcrypto } from 'node:crypto';

import { createClient } from '../documents-api/client';
import { UploadJournal } from './durable-upload-journal';
import { createTestUploadJournal } from './durable-upload-test-utils';
import { createUploadWireFetcher } from './durable-upload-wire-test-routing';

import type { DocumentUploadHostCapability, UploadPersistenceLease } from '@pops/pillar-sdk';

import type { UploadJournalContext } from './durable-upload-journal';
import type { TestUploadJournal } from './durable-upload-test-utils';
import type {
  DurableUploadWire,
  DurableUploadWireOptions,
  UploadWireState,
} from './durable-upload-wire-test-types';

export type {
  DurableUploadWire,
  DurableUploadWireOptions,
  PendingUploadDispatch,
  PendingUploadRead,
} from './durable-upload-wire-test-types';

/** Actual digest/UUID implementation for jsdom upload tests; install with the test runner's global stub. */
export const uploadWebCrypto = webcrypto;

class ReadableFile extends File {
  override arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error('The file reader did not return bytes.'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
      reader.readAsArrayBuffer(this);
    });
  }
}

/** Real browser File with a byte-reading bridge for jsdom's missing Blob.arrayBuffer implementation. */
export function readableUploadFile(contents: string, name: string, type = 'application/pdf'): File {
  return new ReadableFile([contents], name, { type, lastModified: 1 });
}

function createHost(persistence: TestUploadJournal): DocumentUploadHostCapability {
  const listeners = new Set<() => void>();
  return {
    current: (): UploadPersistenceLease | null =>
      persistence.lease.isCurrent() ? persistence.lease : null,
    problem: (): string | null =>
      persistence.lease.isCurrent() ? null : 'Verify upload recovery identity.',
    verify: async (): Promise<UploadPersistenceLease> => {
      await persistence.lease.verify();
      for (const listener of listeners) listener();
      return persistence.lease;
    },
    invalidate: (): void => {
      persistence.lease.invalidate();
      for (const listener of listeners) listener();
    },
    subscribe: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

function countRequests(state: UploadWireState, method: string, suffix: string): number {
  return state.requests.filter(
    (request) => request.method === method && new URL(request.url).pathname.endsWith(suffix)
  ).length;
}

/** Actual generated-client transport, canonical owner ledger and real verified journal authority for UI tests. */
export function createDurableUploadWire(options: DurableUploadWireOptions = {}): DurableUploadWire {
  const baseUrl = options.baseUrl ?? 'https://owner-a.test/documents-api';
  const server = new URL(baseUrl).origin;
  const persistence = createTestUploadJournal(
    { documentsOrigin: baseUrl, tripsOrigin: `${server}/trips-api` },
    { server }
  );
  const state: UploadWireState = {
    options,
    requests: [],
    records: new Map(),
    dispatches: [],
    reads: [],
    readFailure: false,
  };
  const client = createClient({ baseUrl, fetch: createUploadWireFetcher(state) });
  return {
    client,
    requests: state.requests,
    records: state.records,
    dispatches: state.dispatches,
    reads: state.reads,
    persistence,
    host: createHost(persistence),
    createJournal: (context: UploadJournalContext): UploadJournal =>
      new UploadJournal(persistence.lease, context),
    createCount: (): number => countRequests(state, 'POST', '/paperless/uploads'),
    putCount: (): number => countRequests(state, 'PUT', '/content'),
    dispatchCount: (): number => countRequests(state, 'POST', '/dispatch'),
    failReads: (): void => {
      state.readFailure = true;
    },
    restoreReads: (): void => {
      state.readFailure = false;
    },
  };
}
