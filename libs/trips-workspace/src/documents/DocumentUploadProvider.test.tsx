import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { sourceUploadSession } from '../shared/source-upload-sessions';
import { createClient as createTripsClient } from '../trips-api/client';
import { DocumentUploadProvider, useUploadJournal } from './DocumentUploadProvider';
import { UploadJournal } from './durable-upload-journal';
import { createTestUploadJournal } from './durable-upload-test-utils';

import type { ReactNode } from 'react';

import type { DocumentUploadHostCapability, UploadPersistenceLease } from '@pops/pillar-sdk';

import type { DurableUploadInput } from './durable-upload-api';
import type { DocumentAssociationTarget } from './types';

afterEach(cleanup);

function hostFixture(account = 'account-a', known = true) {
  const backing = createTestUploadJournal();
  const read = vi.fn(backing.lease.read);
  const lease: UploadPersistenceLease = {
    ...backing.lease,
    identity: { ...backing.lease.identity, account },
    read,
  };
  const listeners = new Set<() => void>();
  const host: DocumentUploadHostCapability = {
    current: () => (known && lease.isCurrent() ? lease : null),
    problem: () => (known ? null : 'Sign in to recover uploads.'),
    verify: async () => {
      if (!known) throw new Error('Sign in to recover uploads.');
      return lease;
    },
    invalidate: () => {
      lease.invalidate();
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { host, lease, read };
}

function clients() {
  const requests: Request[] = [];
  const fetcher: typeof globalThis.fetch = async (resource, init) => {
    requests.push(new Request(resource, init));
    throw new Error('Deriving a journal must not request owner data.');
  };
  return {
    tripsClient: createTripsClient({ baseUrl: 'https://owner-a.test/trips-api', fetch: fetcher }),
    documentsClient: createDocumentsClient({
      baseUrl: 'https://owner-a.test/documents-api',
      fetch: fetcher,
    }),
    requests,
  };
}

function descriptor(): DurableUploadInput {
  return {
    operationId: crypto.randomUUID(),
    fileName: 'booking.pdf',
    mimeType: 'application/pdf',
    byteLength: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
}

it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5])(
  'rejects invalid Trip identity %s without reading metadata or looping on rerender',
  async (tripId) => {
    const identity = hostFixture();
    const owners = clients();
    const view = renderHook(() => useUploadJournal(null), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <DocumentUploadProvider
          tripId={tripId}
          host={identity.host}
          tripsClient={owners.tripsClient}
          documentsClient={owners.documentsClient}
        >
          {children}
        </DocumentUploadProvider>
      ),
    });
    await waitFor(() => expect(view.result.current.problem).not.toBeNull());
    expect(view.result.current.journal).toBeNull();
    view.rerender();
    expect(view.result.current.journal).toBeNull();
    expect(identity.read).not.toHaveBeenCalled();
    expect(owners.requests).toEqual([]);
  }
);

it('does not expose the previous host lease during the first render after replacing verified A with host B', async () => {
  const a = hostFixture();
  const b = hostFixture('account-b');
  const owners = clients();
  let currentHost = a.host;
  const renders: (UploadJournal | null)[] = [];
  const view = renderHook(
    () => {
      const result = useUploadJournal(null);
      renders.push(result.journal);
      return result;
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <DocumentUploadProvider
          tripId={7}
          host={currentHost}
          tripsClient={owners.tripsClient}
          documentsClient={owners.documentsClient}
        >
          {children}
        </DocumentUploadProvider>
      ),
    }
  );
  await waitFor(() => expect(view.result.current.journal).not.toBeNull());
  const original = view.result.current.journal;
  if (original === null) throw new Error('Verified A journal missing.');
  original.admit(descriptor());
  const changedAt = renders.length;
  currentHost = b.host;
  view.rerender();
  expect(renders[changedAt]).toBeNull();
  await waitFor(() => expect(view.result.current.journal).not.toBeNull());
  expect(view.result.current.journal?.bindingKey()).not.toBe(original.bindingKey());
  expect(view.result.current.journal?.list()).toEqual([]);
  expect(owners.requests).toEqual([]);
});

it('does not read pending metadata while principal identity is unknown and reports an actionable problem', async () => {
  const identity = hostFixture('unknown', false);
  const owners = clients();
  const view = renderHook(() => useUploadJournal(null), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DocumentUploadProvider
        tripId={7}
        host={identity.host}
        tripsClient={owners.tripsClient}
        documentsClient={owners.documentsClient}
      >
        {children}
      </DocumentUploadProvider>
    ),
  });
  await waitFor(() => expect(view.result.current.problem).toBe('Sign in to recover uploads.'));
  expect(view.result.current.journal).toBeNull();
  expect(identity.read).not.toHaveBeenCalled();
  expect(owners.requests).toEqual([]);
});

it('blocks same-client mutable Documents origins and permits an explicit new valid client context', async () => {
  const identity = hostFixture();
  const owners = clients();
  let documents = owners.documentsClient;
  const view = renderHook(() => useUploadJournal(null), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DocumentUploadProvider
        tripId={7}
        host={identity.host}
        tripsClient={owners.tripsClient}
        documentsClient={documents}
      >
        {children}
      </DocumentUploadProvider>
    ),
  });
  await waitFor(() => expect(view.result.current.journal).not.toBeNull());
  documents.setConfig({ baseUrl: 'https://owner-a.test/changed-documents-api' });
  view.rerender();
  expect(view.result.current.journal).toBeNull();
  expect(view.result.current.problem).not.toBeNull();
  documents.setConfig({ baseUrl: 'https://owner-a.test/documents-api' });
  view.rerender();
  expect(view.result.current.journal).not.toBeNull();
  documents.setConfig({ baseUrl: 'https://owner-b.test/documents-api' });
  view.rerender();
  expect(view.result.current.journal).toBeNull();
  expect(view.result.current.problem).not.toBeNull();
  documents = createDocumentsClient({ baseUrl: 'https://owner-a.test/documents-api' });
  view.rerender();
  await waitFor(() => expect(view.result.current.journal).not.toBeNull());
  expect(view.result.current.problem).toBeNull();
});

it('rejects an explicit cross-server client that has no verified host authority', async () => {
  const identity = hostFixture();
  const owners = clients();
  const foreign = createDocumentsClient({ baseUrl: 'https://owner-b.test/documents-api' });
  const view = renderHook(() => useUploadJournal(null), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DocumentUploadProvider
        tripId={7}
        host={identity.host}
        tripsClient={owners.tripsClient}
        documentsClient={foreign}
      >
        {children}
      </DocumentUploadProvider>
    ),
  });
  await waitFor(() => expect(view.result.current.problem).not.toBeNull());
  expect(view.result.current.journal).toBeNull();
  expect(identity.read).not.toHaveBeenCalled();
});

it('isolates trip and explicit source targets while preserving the same verified account authority', async () => {
  const identity = hostFixture();
  const owners = clients();
  let tripId = 7;
  const view = renderHook(
    () => ({
      trip: useUploadJournal(null),
      visit: useUploadJournal({ kind: 'visit', id: 8 }),
      stay: useUploadJournal({ kind: 'stay', id: 8 }),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <DocumentUploadProvider
          tripId={tripId}
          host={identity.host}
          tripsClient={owners.tripsClient}
          documentsClient={owners.documentsClient}
        >
          {children}
        </DocumentUploadProvider>
      ),
    }
  );
  await waitFor(() => expect(view.result.current.trip.journal).not.toBeNull());
  const initial = view.result.current;
  const keys = [
    initial.trip.journal?.bindingKey(),
    initial.visit.journal?.bindingKey(),
    initial.stay.journal?.bindingKey(),
  ];
  expect(new Set(keys).size).toBe(3);
  const pending = descriptor();
  act(() => initial.visit.journal?.admit(pending));
  expect(initial.visit.journal?.list()).toEqual([pending]);
  expect(initial.trip.journal?.list()).toEqual([]);
  expect(initial.stay.journal?.list()).toEqual([]);
  tripId = 9;
  view.rerender();
  await waitFor(() => expect(view.result.current.visit.journal).not.toBeNull());
  expect(view.result.current.visit.journal?.bindingKey()).not.toBe(
    initial.visit.journal?.bindingKey()
  );
  expect(view.result.current.visit.journal?.list()).toEqual([]);
});

it('keeps source upload queues separate for A and B principal bindings in one query-cache lifetime', () => {
  const owners = clients();
  const a = hostFixture();
  const b = hostFixture('account-b');
  const target: DocumentAssociationTarget = { kind: 'stay', id: 8 };
  const source = {
    tripId: 7,
    target,
    tripsClient: owners.tripsClient,
    documentsClient: owners.documentsClient,
  };
  const context = {
    tripId: 7,
    tripsOrigin: 'https://owner-a.test/trips-api',
    documentsOrigin: 'https://owner-a.test/documents-api',
    target,
  };
  const cache = new QueryClient();
  const bindingA = new UploadJournal(a.lease, context).bindingKey();
  const bindingB = new UploadJournal(b.lease, context).bindingKey();
  const first = sourceUploadSession(cache, source, bindingA);
  const file = new File(['abc'], 'booking.pdf', { type: 'application/pdf' });
  first.addFiles([file]);
  const second = sourceUploadSession(cache, source, bindingB);
  expect(second).not.toBe(first);
  expect(second.read()).toEqual([]);
  expect(first.read()[0]?.file).toBe(file);
  expect(sourceUploadSession(cache, source, bindingA)).toBe(first);
  cache.clear();
});
