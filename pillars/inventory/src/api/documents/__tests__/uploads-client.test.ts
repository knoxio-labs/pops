/**
 * {@link createDocumentUploadsClient} against a stub documents handle and a
 * fake `fetch`: which SDK failures mean "the task is unknown" versus "ask
 * again later", and what the byte legs send.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  type CallDynamicFn,
  type CallFailure,
  type CallResult,
  type CallableProcedure,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import { documentsSnapshot, DOCUMENTS_BASE_URL } from '../../__tests__/document-uploads-fixture.js';
import {
  createDocumentUploadsClient,
  DocumentsUnreachableError,
  type DocumentsUploadsRouter,
  type PaperlessTaskStatus,
} from '../uploads-client.js';

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
  throw new Error('callDynamic is not used');
};

function unexpected(name: string): never {
  throw new Error(`stub ${name} called unexpectedly`);
}

interface StubImpls {
  status?: () => Promise<CallResult<{ data: { maxUploadBytes: number } }>>;
  task?: (input: { taskId: string }) => Promise<CallResult<{ data: PaperlessTaskStatus }>>;
  update?: (input: { id: number; title: string }) => Promise<CallResult<{ data: unknown }>>;
}

function client(impls: StubImpls, fetchImpl: typeof fetch = vi.fn<typeof fetch>()) {
  const handle: PillarHandle<DocumentsUploadsRouter> = {
    paperless: {
      status: proc(impls.status ?? (() => unexpected('status'))),
      task: proc(impls.task ?? (() => unexpected('task'))),
    },
    write: { update: proc(impls.update ?? (() => unexpected('update'))) },
    callDynamic,
  };
  return createDocumentUploadsClient({
    handleFactory: () => handle,
    lookupDocumentsPillar: () => Promise.resolve(documentsSnapshot()),
    fetchImpl,
  });
}

const status: PaperlessTaskStatus = { state: 'done', documentId: 3, reason: null };

describe('taskStatus', () => {
  it('returns the status documents reports', async () => {
    const task = vi.fn(async () => ({ kind: 'ok' as const, value: { data: status } }));

    await expect(client({ task }).taskStatus('abc')).resolves.toEqual({ kind: 'resolved', status });
    expect(task).toHaveBeenCalledWith({ taskId: 'abc' });
  });

  it('reads a 404 as an unknown task', async () => {
    const task = async (): Promise<CallResult<{ data: PaperlessTaskStatus }>> => ({
      kind: 'not-found',
      pillar: 'documents',
    });

    await expect(client({ task }).taskStatus('abc')).resolves.toEqual({ kind: 'unknown' });
  });

  it.each<CallFailure>([
    { kind: 'unavailable', pillar: 'documents' },
    { kind: 'refused', pillar: 'documents', status: 412 },
    { kind: 'degraded', pillar: 'documents', reason: 'reconciling' },
    { kind: 'unauthorized', pillar: 'documents' },
  ])('reads %o as unreachable, never as a failed task', async (failure) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const task = async (): Promise<CallResult<{ data: PaperlessTaskStatus }>> => failure;

    await expect(client({ task }).taskStatus('abc')).resolves.toEqual({ kind: 'unreachable' });
  });

  it('reads a thrown call as unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const task = async (): Promise<CallResult<{ data: PaperlessTaskStatus }>> => {
      throw new Error('registry down');
    };

    await expect(client({ task }).taskStatus('abc')).resolves.toEqual({ kind: 'unreachable' });
  });
});

describe('updateTitle', () => {
  it('sends the id and title and reports success', async () => {
    const update = vi.fn(async () => ({ kind: 'ok' as const, value: { data: {} } }));

    await expect(client({ update }).updateTitle(7, 'New')).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ id: 7, title: 'New' });
  });

  it('returns the failure', async () => {
    const failure: CallFailure = { kind: 'refused', pillar: 'documents', status: 412 };

    await expect(client({ update: async () => failure }).updateTitle(7, 'New')).resolves.toEqual({
      ok: false,
      failure,
    });
  });
});

describe('maxUploadBytes', () => {
  it('reads the cap from the status route, or null when documents cannot say', async () => {
    const ok = async () => ({ kind: 'ok' as const, value: { data: { maxUploadBytes: 2048 } } });
    const down = async (): Promise<CallResult<{ data: { maxUploadBytes: number } }>> => ({
      kind: 'unavailable',
      pillar: 'documents',
    });

    await expect(client({ status: ok }).maxUploadBytes()).resolves.toBe(2048);
    await expect(client({ status: down }).maxUploadBytes()).resolves.toBeNull();
  });
});

describe('the byte legs', () => {
  it('posts the upload with its metadata in the query and the body as a stream', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }));
    const body = new ReadableStream<Uint8Array>();

    await client({}, fetchImpl).upload({
      body,
      contentType: 'image/png',
      contentLength: undefined,
      fileName: 'a b.png',
      title: undefined,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${DOCUMENTS_BASE_URL}/paperless/documents?fileName=a+b.png`,
      expect.objectContaining({
        method: 'POST',
        body,
        duplex: 'half',
        headers: { 'Content-Type': 'image/png', Accept: 'application/json' },
      })
    );
  });

  it('throws DocumentsUnreachableError when the request gets no response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));

    await expect(client({}, fetchImpl).download(1, undefined)).rejects.toBeInstanceOf(
      DocumentsUnreachableError
    );
  });

  it('throws DocumentsUnreachableError when discovery fails', async () => {
    const unreachable = createDocumentUploadsClient({
      lookupDocumentsPillar: () => Promise.reject(new Error('registry down')),
      fetchImpl: vi.fn<typeof fetch>(),
    });

    await expect(unreachable.download(1, 'bytes=0-1')).rejects.toBeInstanceOf(
      DocumentsUnreachableError
    );
  });
});
