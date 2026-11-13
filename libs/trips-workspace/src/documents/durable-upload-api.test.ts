import { describe, expect, it, vi } from 'vitest';

import { createClient } from '../documents-api/client';
import {
  createDurableUpload,
  dispatchDurableUpload,
  putDurableUploadContent,
  readDurableUpload,
} from './durable-upload-api';

import type {
  DurableUploadInput,
  DurableUploadRecord,
  DurableUploadTransport,
} from './durable-upload-api';

const input: DurableUploadInput = {
  operationId: 'ab88a8e8-f685-4d47-8d4c-a7e3eb8fdb08',
  fileName: 'booking.pdf',
  title: 'Booking',
  mimeType: 'application/pdf',
  byteLength: 3,
  sha256: 'a'.repeat(64),
};

function admitted(): DurableUploadRecord {
  return {
    input: { ...input },
    ownerMatches: true,
    state: 'admitted',
    contentAvailable: true,
    taskId: null,
    documentId: null,
    reason: null,
  };
}

function transportFor(payload: unknown, status = 200) {
  const requests: Request[] = [];
  const beforeRequest = vi.fn();
  const fetcher: typeof globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init);
    requests.push(request);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createClient({ baseUrl: 'https://documents.test', fetch: fetcher });
  return { client, beforeRequest, requests };
}

const operations = [
  { name: 'create', invoke: createDurableUpload, method: 'POST', suffix: '' },
  {
    name: 'content',
    invoke: (intent: DurableUploadInput, transport: DurableUploadTransport) =>
      putDurableUploadContent(
        intent,
        new File(['pdf'], intent.fileName, { type: intent.mimeType }),
        transport
      ),
    method: 'PUT',
    suffix: `/${input.operationId}/content`,
  },
  {
    name: 'dispatch',
    invoke: dispatchDurableUpload,
    method: 'POST',
    suffix: `/${input.operationId}/dispatch`,
  },
  {
    name: 'read',
    invoke: readDurableUpload,
    method: 'GET',
    suffix: `/${input.operationId}`,
  },
];

describe.each(operations)('$name durable upload transport', ({ invoke, method, suffix }) => {
  it('uses only Documents and fences dispatch with redirects disabled', async () => {
    const record = admitted();
    const transport = transportFor({ data: record });
    transport.beforeRequest.mockImplementation(() => {
      expect(transport.requests).toHaveLength(0);
    });
    await expect(invoke(input, transport)).resolves.toEqual(record);
    expect(transport.beforeRequest).toHaveBeenCalledTimes(1);
    expect(transport.requests).toHaveLength(1);
    const request = transport.requests[0];
    expect(request?.url).toBe(`https://documents.test/paperless/uploads${suffix}`);
    expect(request?.method).toBe(method);
    expect(request?.redirect).toBe('error');
  });

  it('does not dispatch when the captured owner guard fails', async () => {
    const transport = transportFor({ data: admitted() });
    transport.beforeRequest.mockImplementation(() => {
      throw new Error('owner changed');
    });
    await expect(invoke(input, transport)).rejects.toThrow('owner changed');
    expect(transport.requests).toHaveLength(0);
  });

  it.each(['malformed JSON', 'connection failure'])(
    'rejects %s without returning durable proof',
    async (failure) => {
      const fetcher: typeof globalThis.fetch = async () => {
        if (failure === 'connection failure') throw new Error('connection lost');
        return new Response('{', { headers: { 'Content-Type': 'application/json' } });
      };
      await expect(
        invoke(input, {
          client: createClient({ baseUrl: 'https://documents.test', fetch: fetcher }),
          beforeRequest: () => {},
        })
      ).rejects.toThrow();
    }
  );

  it.each([201, 202, 301, 302, 303, 307, 308])(
    'rejects status %i even when its payload is canonical',
    async (status) => {
      const transport = transportFor({ data: admitted() }, status);
      await expect(invoke(input, transport)).rejects.toThrow();
      expect(transport.requests).toHaveLength(1);
    }
  );

  it.each([
    ['malformed envelope', null],
    ['missing record', {}],
    ['unknown state', { data: { ...admitted(), state: 'pending' } }],
    ['missing field', { data: { ...admitted(), contentAvailable: undefined } }],
    ['extra envelope field', { data: admitted(), unchecked: true }],
    ['extra record field', { data: { ...admitted(), unchecked: true } }],
    ['extra input field', { data: { ...admitted(), input: { ...input, unchecked: true } } }],
    ['invalid UUID', { data: { ...admitted(), input: { ...input, operationId: 'bad' } } }],
    ['inconsistent state evidence', { data: { ...admitted(), taskId: 'task-1' } }],
    ['unsent original evidence', { data: { ...admitted(), documentId: 91 } }],
    ['unsent failure evidence', { data: { ...admitted(), reason: 'unproven' } }],
  ])('rejects %s through the complete generated response schema', async (_name, payload) => {
    await expect(invoke(input, transportFor(payload))).rejects.toMatchObject({
      code: 'trips.documents.upload_response_invalid',
    });
  });

  it.each([
    { operationId: 'cbaa52e9-cc27-4c6a-a315-166f65c40d8c' },
    { fileName: 'other.pdf' },
    { title: 'Other booking' },
    { title: undefined },
    { mimeType: 'image/png' },
    { byteLength: 4 },
    { sha256: 'b'.repeat(64) },
  ])('rejects canonical proof for a different immutable input: %j', async (changed) => {
    const payload = { data: { ...admitted(), input: { ...input, ...changed } } };
    await expect(invoke(input, transportFor(payload))).rejects.toMatchObject({
      code: 'trips.documents.upload_response_invalid',
    });
  });

  it('accepts a valid captured-owner acknowledgement after the current view changes', async () => {
    let currentOwner = 'A';
    const record = admitted();
    const fetcher: typeof globalThis.fetch = async () => {
      currentOwner = 'B';
      return new Response(JSON.stringify({ data: record }), {
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const beforeRequest = vi.fn(() => {
      if (currentOwner !== 'A') throw new Error('owner changed');
    });
    await expect(
      invoke(input, {
        client: createClient({ baseUrl: 'https://documents.test', fetch: fetcher }),
        beforeRequest,
      })
    ).resolves.toEqual(record);
    expect(beforeRequest).toHaveBeenCalledTimes(1);
  });
});

it('sends only the immutable JSON intent when creating the operation', async () => {
  const transport = transportFor({ data: admitted() });
  await createDurableUpload(input, transport);
  await expect(transport.requests[0]?.json()).resolves.toEqual(input);
});

it('passes the original File to the sanctioned PUT with JSON serialization disabled', async () => {
  const file = new File(['pdf'], input.fileName, { type: input.mimeType });
  const transport = transportFor({ data: admitted() });
  const bodies: unknown[] = [];
  transport.client.interceptors.request.use((request, options) => {
    bodies.push(options.body);
    expect(options.bodySerializer).toBeNull();
    expect(request.headers.get('Content-Type')).toBe(input.mimeType);
    return request;
  });
  await putDurableUploadContent(input, file, transport);
  expect(bodies).toEqual([file]);
  expect(bodies[0]).toBe(file);
});

it('returns every canonical durable state without inventing dispatch permission', async () => {
  const shared = { input, ownerMatches: false };
  const records: DurableUploadRecord[] = [
    {
      ...shared,
      state: 'awaiting_content',
      contentAvailable: false,
      taskId: null,
      documentId: null,
      reason: null,
    },
    { ...admitted(), ownerMatches: false },
    {
      ...shared,
      state: 'outcome_unknown',
      contentAvailable: false,
      taskId: null,
      documentId: null,
      reason: null,
      blockedBy: 'restored_history',
    },
    {
      ...shared,
      state: 'accepted',
      contentAvailable: true,
      taskId: 'task-1',
      documentId: null,
      reason: null,
    },
    {
      ...shared,
      state: 'done',
      contentAvailable: false,
      taskId: 'task-1',
      documentId: 8,
      reason: null,
    },
    {
      ...shared,
      state: 'duplicate',
      contentAvailable: true,
      taskId: 'task-1',
      documentId: 9,
      reason: 'Already present',
    },
    {
      ...shared,
      state: 'failed',
      contentAvailable: true,
      taskId: 'task-1',
      documentId: null,
      reason: 'Processing failed',
    },
  ];
  for (const record of records) {
    const transport = transportFor({ data: record });
    await expect(readDurableUpload(input, transport)).resolves.toEqual(record);
    expect(transport.requests.map((request) => request.method)).toEqual(['GET']);
  }
});

it('rejects a raw not-found code without a complete canonical GET error envelope', async () => {
  const transport = transportFor({ code: 'documents.upload.not_found' }, 404);
  await expect(readDurableUpload(input, transport)).rejects.toMatchObject({
    code: 'trips.documents.upload_response_invalid',
  });
  expect(transport.requests).toHaveLength(1);
});

it('returns absence only for a complete canonical nonretryable Documents not-found envelope', async () => {
  const transport = transportFor(
    {
      code: 'documents.upload.not_found',
      message: 'The upload operation does not exist.',
      requestId: 'canonical-absence-test',
      retryable: false,
    },
    404
  );
  await expect(readDurableUpload(input, transport)).resolves.toBeNull();
  expect(transport.requests).toHaveLength(1);
  expect(transport.requests[0]?.method).toBe('GET');
});

it('does not treat a retryable or unchecked not-found envelope as canonical absence', async () => {
  for (const extra of [{ retryable: true }, { unchecked: true }]) {
    const transport = transportFor(
      {
        code: 'documents.upload.not_found',
        message: 'The upload operation does not exist.',
        requestId: 'noncanonical-absence-test',
        retryable: false,
        ...extra,
      },
      404
    );
    await expect(readDurableUpload(input, transport)).rejects.toMatchObject({
      code: 'trips.documents.upload_response_invalid',
    });
  }
});
