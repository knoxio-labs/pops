import { describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for {@link createDocumentsClient} driven against a hand-built
 * stub of the documents pillar handle. Exercises the graceful-degrade paths
 * (the pillar being unavailable/degraded/mismatched all collapse to the same
 * conservative "not configured" shape) and the happy path.
 */
import {
  type CallDynamicFn,
  type CallResult,
  type CallableProcedure,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import {
  createDocumentsClient,
  type DocumentsRouter,
  type PaperlessSearchDocument,
  type PaperlessStatus,
} from '../client.js';

function ok<T>(value: T): CallResult<T> {
  return { kind: 'ok', value };
}

function unavailable<T>(): CallResult<T> {
  return { kind: 'unavailable', pillar: 'documents' };
}

function proc<Args extends readonly unknown[], Output>(
  fn: (...args: Args) => Promise<CallResult<Output>>
): CallableProcedure<Args, Output> {
  const orThrow = async (...args: Args): Promise<Output> => {
    const result = await fn(...args);
    if (result.kind !== 'ok') throw new Error(`stub orThrow: ${result.kind}`);
    return result.value;
  };
  return Object.assign(fn, { orThrow });
}

const callDynamic: CallDynamicFn = () => {
  throw new Error('callDynamic is not used by the documents client');
};

interface StubImpls {
  status?: () => Promise<CallResult<{ data: PaperlessStatus }>>;
  search?: (input: { query: string }) => Promise<CallResult<{ data: PaperlessSearchDocument[] }>>;
}

function unexpected(name: string): never {
  throw new Error(`stub ${name} called unexpectedly`);
}

function stubHandle(impls: StubImpls): PillarHandle<DocumentsRouter> {
  return {
    paperless: {
      status: proc(impls.status ?? (() => unexpected('paperless.status'))),
      search: proc(impls.search ?? (() => unexpected('paperless.search'))),
    },
    callDynamic,
  };
}

describe('createDocumentsClient.getPaperlessStatus', () => {
  it('returns the documents pillar data on success', async () => {
    const status = { configured: true, available: true, baseUrl: 'https://paperless.example' };
    const client = createDocumentsClient(() =>
      stubHandle({ status: async () => ok({ data: status }) })
    );

    await expect(client.getPaperlessStatus()).resolves.toEqual(status);
  });

  it('degrades to a conservative "not configured" shape when documents is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createDocumentsClient(() => stubHandle({ status: async () => unavailable() }));

    await expect(client.getPaperlessStatus()).resolves.toEqual({
      configured: false,
      available: false,
      baseUrl: null,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('degraded'));
    warn.mockRestore();
  });
});

describe('createDocumentsClient.searchPaperlessDocuments', () => {
  it('returns the documents pillar results on success', async () => {
    const docs: PaperlessSearchDocument[] = [
      {
        id: 42,
        title: 'Electricity bill',
        created: '2026-01-01T00:00:00Z',
        originalFileName: 'bill.pdf',
        thumbnailUrl: 'https://paperless.example/thumb/42',
      },
    ];
    const client = createDocumentsClient(() =>
      stubHandle({ search: async () => ok({ data: docs }) })
    );

    await expect(client.searchPaperlessDocuments('bill')).resolves.toEqual(docs);
  });

  it('returns null (not thrown) when documents reports the integration is unconfigured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createDocumentsClient(() => stubHandle({ search: async () => unavailable() }));

    await expect(client.searchPaperlessDocuments('bill')).resolves.toBeNull();
    warn.mockRestore();
  });

  it('passes the query through to the documents pillar call', async () => {
    const search = vi.fn(async (_input: { query: string }) => ok({ data: [] }));
    const client = createDocumentsClient(() => stubHandle({ search }));

    await client.searchPaperlessDocuments('receipt');

    expect(search).toHaveBeenCalledWith({ query: 'receipt' });
  });
});
