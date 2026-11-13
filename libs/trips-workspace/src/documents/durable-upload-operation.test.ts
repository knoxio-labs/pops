// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createClient } from '../documents-api/client';
import { DurableUploadOperation } from './durable-upload-operation';
import { createTestUploadJournal } from './durable-upload-test-utils';
import { TripDocumentUploadContextError } from './upload-context-error';

import type { ErrorBody } from '../documents-api/types.gen';
import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';

function operationFixture() {
  const file = new File(['abc'], 'booking.pdf', { type: 'application/pdf' });
  const operationId = crypto.randomUUID();
  const input: DurableUploadInput = {
    operationId,
    fileName: file.name,
    mimeType: file.type,
    byteLength: file.size,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
  const awaiting: DurableUploadRecord = {
    input,
    ownerMatches: true,
    state: 'awaiting_content',
    taskId: null,
    documentId: null,
    reason: null,
    contentAvailable: false,
  };
  const admitted: DurableUploadRecord = { ...awaiting, state: 'admitted', contentAvailable: true };
  const accepted: DurableUploadRecord = {
    ...admitted,
    state: 'accepted',
    taskId: 'owner-task-1',
  };
  const unknown: DurableUploadRecord = {
    ...awaiting,
    state: 'outcome_unknown',
    contentAvailable: true,
    blockedBy: 'dispatch_unproven',
  };
  const operation = new DurableUploadOperation(operationId, file);
  const persistence = createTestUploadJournal({ documentsOrigin: 'https://documents.test' });
  operation.bindJournal(persistence.journal);
  return {
    operation,
    persistence,
    input,
    awaiting,
    admitted,
    accepted,
    unknown,
  };
}

function proof(record: DurableUploadRecord): Response {
  return new Response(JSON.stringify({ data: record }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function controlledTransport(respond: (request: Request) => Promise<Response> | Response) {
  const requests: Request[] = [];
  const fetcher: typeof globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init);
    requests.push(request);
    return respond(request);
  };
  return {
    client: createClient({ baseUrl: 'https://documents.test', fetch: fetcher }),
    beforeRequest: () => {},
    requests,
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred request was not initialized.');
  };
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function requestPaths(requests: Request[]): string[] {
  return requests.map((request) => `${request.method} ${new URL(request.url).pathname}`);
}

it('recovers a lost create acknowledgement with GET and resumes the exact UUID only on explicit start', async () => {
  const { operation, input, awaiting, admitted, accepted } = operationFixture();
  let created = false;
  const transport = controlledTransport(async (request) => {
    if (request.method === 'GET') return proof(awaiting);
    if (request.method === 'PUT') return proof(admitted);
    if (request.url.endsWith('/dispatch')) return proof(accepted);
    expect(await request.json()).toEqual(input);
    if (!created) {
      created = true;
      throw new Error('create response lost');
    }
    throw new Error('create was replayed unexpectedly');
  });
  await expect(operation.start(transport)).rejects.toThrow();
  expect(operation.readInput()).toEqual(input);
  expect(operation.needsRecovery()).toBe(true);
  await expect(operation.start(transport)).rejects.toThrow();
  expect(transport.requests).toHaveLength(1);
  await expect(operation.recover(transport)).resolves.toEqual(awaiting);
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `GET /paperless/uploads/${input.operationId}`,
  ]);
  await expect(operation.start(transport)).resolves.toEqual(accepted);
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `GET /paperless/uploads/${input.operationId}`,
    `PUT /paperless/uploads/${input.operationId}/content`,
    `POST /paperless/uploads/${input.operationId}/dispatch`,
  ]);
  expect(operation.readInput()).toEqual(input);
});

it('recovers a lost content acknowledgement as admitted and dispatches without another PUT', async () => {
  const { operation, input, awaiting, admitted, accepted } = operationFixture();
  const transport = controlledTransport((request) => {
    if (request.method === 'GET') return proof(admitted);
    if (request.method === 'PUT') throw new Error('content response lost');
    return proof(request.url.endsWith('/dispatch') ? accepted : awaiting);
  });
  await expect(operation.start(transport)).rejects.toThrow();
  expect(operation.needsRecovery()).toBe(true);
  await expect(operation.recover(transport)).resolves.toEqual(admitted);
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `PUT /paperless/uploads/${input.operationId}/content`,
    `GET /paperless/uploads/${input.operationId}`,
  ]);
  await expect(operation.start(transport)).resolves.toEqual(accepted);
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `PUT /paperless/uploads/${input.operationId}/content`,
    `GET /paperless/uploads/${input.operationId}`,
    `POST /paperless/uploads/${input.operationId}/dispatch`,
  ]);
});

it('keeps a lost dispatch outcome unknown after GET and never sends a second dispatch POST', async () => {
  const { operation, input, awaiting, admitted, unknown } = operationFixture();
  const transport = controlledTransport((request) => {
    if (request.method === 'GET') return proof(unknown);
    if (request.method === 'PUT') return proof(admitted);
    if (request.url.endsWith('/dispatch')) throw new Error('dispatch response lost');
    return proof(awaiting);
  });
  await expect(operation.start(transport)).rejects.toThrow();
  await expect(operation.recover(transport)).resolves.toEqual(unknown);
  expect(operation.needsRecovery()).toBe(true);
  await expect(operation.start(transport)).rejects.toThrow();
  await expect(operation.recover(transport)).resolves.toEqual(unknown);
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `PUT /paperless/uploads/${input.operationId}/content`,
    `POST /paperless/uploads/${input.operationId}/dispatch`,
    `GET /paperless/uploads/${input.operationId}`,
    `GET /paperless/uploads/${input.operationId}`,
  ]);
});

describe.each(['missing operation', 'missing task'])(
  'retained accepted proof after %s',
  (missing) => {
    it('does not erase the owner task or authorize any new write', async () => {
      const { operation, awaiting, admitted, accepted } = operationFixture();
      const transport = controlledTransport((request) => {
        if (request.method === 'GET') {
          if (missing === 'missing task') return proof(awaiting);
          return new Response(
            JSON.stringify({
              code: 'documents.upload.not_found',
              message: 'Upload operation not found.',
              retryable: false,
              requestId: 'upload-recovery-test',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (request.method === 'PUT') return proof(admitted);
        return proof(request.url.endsWith('/dispatch') ? accepted : awaiting);
      });
      await expect(operation.start(transport)).resolves.toEqual(accepted);
      await expect(operation.recover(transport)).resolves.toEqual(accepted);
      const count = transport.requests.length;
      await expect(operation.start(transport)).resolves.toEqual(accepted);
      expect(transport.requests).toHaveLength(count);
      expect(operation.readInput()).toEqual(accepted.input);
    });
  }
);

it('claims the operation synchronously so concurrent starts and recovery cannot overlap requests', async () => {
  const { operation, input, awaiting, admitted, accepted } = operationFixture();
  const enteredCreate = deferred<void>();
  const finishCreate = deferred<Response>();
  const transport = controlledTransport((request) => {
    if (request.method === 'PUT') return proof(admitted);
    if (request.url.endsWith('/dispatch')) return proof(accepted);
    if (request.method === 'GET') throw new Error('recovery overlapped the pending create');
    enteredCreate.resolve();
    return finishCreate.promise;
  });
  const pending = operation.start(transport);
  const duplicateStart = expect(operation.start(transport)).rejects.toThrow();
  const prematureRecovery = expect(operation.recover(transport)).rejects.toThrow();
  await enteredCreate.promise;
  await Promise.all([duplicateStart, prematureRecovery]);
  expect(requestPaths(transport.requests)).toEqual(['POST /paperless/uploads']);
  finishCreate.resolve(proof(awaiting));
  await expect(pending).resolves.toEqual(accepted);
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `PUT /paperless/uploads/${input.operationId}/content`,
    `POST /paperless/uploads/${input.operationId}/dispatch`,
  ]);
});

it('prevents concurrent recovery and start while a recovery GET owns the claim', async () => {
  const { operation, input, admitted } = operationFixture();
  const enteredRead = deferred<void>();
  const finishRead = deferred<Response>();
  const transport = controlledTransport((request) => {
    if (request.method === 'GET') {
      enteredRead.resolve();
      return finishRead.promise;
    }
    throw new Error('create response lost');
  });
  await expect(operation.start(transport)).rejects.toThrow();
  const pending = operation.recover(transport);
  await enteredRead.promise;
  await expect(operation.recover(transport)).rejects.toThrow();
  await expect(operation.start(transport)).rejects.toThrow();
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `GET /paperless/uploads/${input.operationId}`,
  ]);
  finishRead.resolve(proof(admitted));
  await expect(pending).resolves.toEqual(admitted);
});

async function requireCanonicalRecovery(
  status: number,
  errorBody: string,
  recoveredState: 'awaiting_content' | 'admitted'
): Promise<void> {
  const { operation, persistence, input, awaiting, admitted, accepted } = operationFixture();
  let failedDispatch = false;
  const recovered = recoveredState === 'awaiting_content' ? awaiting : admitted;
  const transport = controlledTransport((request) => {
    if (request.method === 'GET') return proof(recovered);
    if (request.method === 'PUT') return proof(admitted);
    if (!request.url.endsWith('/dispatch')) return proof(awaiting);
    if (failedDispatch) return proof(accepted);
    failedDispatch = true;
    return new Response(errorBody, {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  await expect(operation.start(transport)).rejects.toThrow();
  expect(operation.readInput()).toEqual(input);
  expect(operation.needsRecovery()).toBe(true);
  const beforeRecovery = requestPaths(transport.requests);
  expect(beforeRecovery).toEqual([
    'POST /paperless/uploads',
    `PUT /paperless/uploads/${input.operationId}/content`,
    `POST /paperless/uploads/${input.operationId}/dispatch`,
  ]);
  await expect(operation.start(transport)).rejects.toThrow();
  expect(requestPaths(transport.requests)).toEqual(beforeRecovery);
  if (status === 401) {
    expect(persistence.storage.size).toBe(0);
    await expect(operation.recover(transport)).rejects.toThrow();
    expect(requestPaths(transport.requests)).toEqual(beforeRecovery);
    expect(operation.readInput()).toEqual(input);
    expect(operation.needsRecovery()).toBe(true);
    return;
  }
  await expect(operation.recover(transport)).resolves.toEqual(recovered);
  expect(operation.needsRecovery()).toBe(false);
  expect(requestPaths(transport.requests)).toEqual([
    ...beforeRecovery,
    `GET /paperless/uploads/${input.operationId}`,
  ]);
  await expect(operation.start(transport)).resolves.toEqual(accepted);
  const resumed =
    recoveredState === 'awaiting_content'
      ? [
          `PUT /paperless/uploads/${input.operationId}/content`,
          `POST /paperless/uploads/${input.operationId}/dispatch`,
        ]
      : [`POST /paperless/uploads/${input.operationId}/dispatch`];
  expect(requestPaths(transport.requests)).toEqual([
    ...beforeRecovery,
    `GET /paperless/uploads/${input.operationId}`,
    ...resumed,
  ]);
  expect(operation.readInput()).toEqual(input);
}

describe.each([400, 401, 403, 404, 409, 412, 413, 415, 422])(
  'failed dispatch with HTTP %i',
  (status) => {
    it.each([
      ['malformed response', '<html>Access denied</html>', 'admitted'],
      ['non-ADR response', JSON.stringify({ error: 'Access denied' }), 'awaiting_content'],
    ] as const)(
      'retains its immutable intent after %s and requires verified authority before continuation',
      async (_name, body, recoveredState) => {
        await requireCanonicalRecovery(status, body, recoveredState);
      }
    );
  }
);

it('requires canonical GET proof even after a registered canonical upload-conflict error', async () => {
  const error: ErrorBody = {
    code: 'documents.upload.conflict',
    message: 'The upload operation cannot be changed or dispatched in this state.',
    retryable: false,
    requestId: 'dispatch-conflict-test',
  };
  await requireCanonicalRecovery(409, JSON.stringify(error), 'admitted');
});

it('does not mark a typed local context failure before dispatch as an uncertain write', async () => {
  const { operation, input, awaiting, admitted, accepted } = operationFixture();
  let checks = 0;
  let blockDispatch = true;
  const transport = {
    ...controlledTransport((request) => {
      if (request.method === 'PUT') return proof(admitted);
      return proof(request.url.endsWith('/dispatch') ? accepted : awaiting);
    }),
    beforeRequest: () => {
      checks += 1;
      if (blockDispatch && checks === 1) throw new TripDocumentUploadContextError();
    },
  };
  await expect(operation.start(transport)).rejects.toBeInstanceOf(TripDocumentUploadContextError);
  expect(transport.requests).toHaveLength(0);
  expect(operation.readInput()).toEqual(input);
  expect(operation.needsRecovery()).toBe(false);
  blockDispatch = false;
  await expect(operation.start(transport)).resolves.toEqual(accepted);
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `PUT /paperless/uploads/${input.operationId}/content`,
    `POST /paperless/uploads/${input.operationId}/dispatch`,
  ]);
});

it('keeps uncertainty after a typed callback error once the request callback has been entered', async () => {
  const { operation, input, persistence, awaiting } = operationFixture();
  let fences = 0;
  const transport = {
    ...controlledTransport(() => proof(awaiting)),
    beforeRequest: () => {
      fences += 1;
      if (fences === 2) throw new TripDocumentUploadContextError();
    },
  };
  await expect(operation.start(transport)).rejects.toBeInstanceOf(TripDocumentUploadContextError);
  expect(operation.needsRecovery()).toBe(true);
  expect(operation.readInput()).toEqual(input);
  expect(persistence.journal.list()).toEqual([input]);
  await expect(operation.start(transport)).rejects.toThrow();
  expect(transport.requests).toHaveLength(0);
});

it('does not accept a raw not-found code without a complete canonical GET error envelope as absence proof', async () => {
  const { operation, input, persistence } = operationFixture();
  const transport = controlledTransport((request) => {
    if (request.method === 'GET')
      return new Response(JSON.stringify({ code: 'documents.upload.not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    throw new Error('create acknowledgement lost');
  });
  await expect(operation.start(transport)).rejects.toThrow();
  await expect(operation.recover(transport)).rejects.toThrow();
  expect(operation.needsRecovery()).toBe(true);
  expect(operation.readInput()).toEqual(input);
  expect(persistence.journal.list()).toEqual([input]);
  await expect(operation.start(transport)).rejects.toThrow();
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `GET /paperless/uploads/${input.operationId}`,
  ]);
});

it('accepts canonical GET absence while retaining the UUID and requiring an explicit continuation', async () => {
  const { operation, input, persistence } = operationFixture();
  const error: ErrorBody = {
    code: 'documents.upload.not_found',
    message: 'The upload operation does not exist.',
    requestId: 'canonical-absence-test',
    retryable: false,
  };
  const transport = controlledTransport((request) => {
    if (request.method === 'GET')
      return new Response(JSON.stringify(error), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    throw new Error('create acknowledgement lost');
  });
  await expect(operation.start(transport)).rejects.toThrow();
  await expect(operation.recover(transport)).resolves.toBeNull();
  expect(operation.needsRecovery()).toBe(false);
  expect(operation.readInput()).toEqual(input);
  expect(persistence.journal.list()).toEqual([input]);
  expect(requestPaths(transport.requests)).toEqual([
    'POST /paperless/uploads',
    `GET /paperless/uploads/${input.operationId}`,
  ]);
});

it('rejects a changed original for the same accepted task and retains the previously known original', async () => {
  const { operation, input, awaiting, admitted, accepted } = operationFixture();
  const original: DurableUploadRecord = { ...accepted, state: 'done', documentId: 8 };
  const other: DurableUploadRecord = { ...original, documentId: 9 };
  const transport = controlledTransport((request) => {
    if (request.method === 'GET') return proof(other);
    if (request.method === 'PUT') return proof(admitted);
    return proof(request.url.endsWith('/dispatch') ? original : awaiting);
  });
  await expect(operation.start(transport)).resolves.toEqual(original);
  await expect(operation.recover(transport)).rejects.toThrow('another original');
  expect(operation.readRecord()).toEqual(original);
  const count = transport.requests.length;
  await expect(operation.start(transport)).resolves.toEqual(original);
  expect(transport.requests).toHaveLength(count);
  expect(operation.readInput()).toEqual(input);
});
