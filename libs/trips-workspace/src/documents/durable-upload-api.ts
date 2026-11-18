import { ApiError, unwrap } from '@pops/pillar-sdk/client';

import { paperlessUpload, writeCreateUpload, writeDispatchUpload } from '../documents-api/sdk.gen';
import {
  zErrorBody,
  zPaperlessUploadResponse,
  zWriteCreateUploadResponse,
  zWriteDispatchUploadResponse,
} from '../documents-api/zod.gen';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { PaperlessUploadResponses, WriteCreateUploadData } from '../documents-api/types.gen';

/** Immutable upload intent from the Documents admission contract. */
export type DurableUploadInput = NonNullable<WriteCreateUploadData['body']>;

/** Canonical durable proof returned by the Documents owner. */
export type DurableUploadRecord = PaperlessUploadResponses[200]['data'];

/** Captured Documents transport with an owner fence before each independent request. */
export interface DurableUploadTransport {
  client: DocumentsClient;
  beforeRequest: () => void;
}

function invalidResponse(): ApiError {
  return new ApiError({
    code: 'trips.documents.upload_response_invalid',
    kind: 'client',
    message:
      'Documents returned invalid durable upload proof. Recover the operation before retrying.',
    retryable: false,
  });
}

function readRecord(
  response: Response | undefined,
  payload: unknown,
  parse: (payload: unknown) => DurableUploadRecord,
  expected: DurableUploadInput
): DurableUploadRecord {
  if (response?.status !== 200) throw invalidResponse();
  let record: DurableUploadRecord;
  try {
    record = parse(payload);
  } catch {
    throw invalidResponse();
  }
  const actual = record.input;
  if (
    actual.operationId !== expected.operationId ||
    actual.fileName !== expected.fileName ||
    actual.title !== expected.title ||
    actual.mimeType !== expected.mimeType ||
    actual.byteLength !== expected.byteLength ||
    actual.sha256 !== expected.sha256
  ) {
    throw invalidResponse();
  }
  return record;
}

/** Admit or replay this exact intent; a valid acknowledgement remains proof after view changes. */
export async function createDurableUpload(
  input: DurableUploadInput,
  transport: DurableUploadTransport
): Promise<DurableUploadRecord> {
  transport.beforeRequest();
  const result = await writeCreateUpload({
    client: transport.client,
    body: input,
    redirect: 'error',
  });
  return readRecord(
    result.response,
    unwrap(result),
    (payload) => zWriteCreateUploadResponse.parse(payload).data,
    input
  );
}

/** Retain raw file bytes under the same intent without dispatching an upstream upload. */
export async function putDurableUploadContent(
  input: DurableUploadInput,
  file: File,
  transport: DurableUploadTransport
): Promise<DurableUploadRecord> {
  transport.beforeRequest();
  const result = await transport.client.put<PaperlessUploadResponses>({
    url: '/paperless/uploads/{operationId}/content',
    path: { operationId: input.operationId },
    body: file,
    bodySerializer: null,
    headers: { 'Content-Type': input.mimeType },
    redirect: 'error',
  });
  return readRecord(
    result.response,
    unwrap(result),
    (payload) => zPaperlessUploadResponse.parse(payload).data,
    input
  );
}

/** Ask Documents to dispatch or recover this intent, preserving its canonical durable proof. */
export async function dispatchDurableUpload(
  input: DurableUploadInput,
  transport: DurableUploadTransport
): Promise<DurableUploadRecord> {
  transport.beforeRequest();
  const result = await writeDispatchUpload({
    client: transport.client,
    path: { operationId: input.operationId },
    redirect: 'error',
  });
  return readRecord(
    result.response,
    unwrap(result),
    (payload) => zWriteDispatchUploadResponse.parse(payload).data,
    input
  );
}

/** Recover exact durable proof without writes; null requires a complete canonical nonretryable owner absence response. */
export async function readDurableUpload(
  input: DurableUploadInput,
  transport: DurableUploadTransport
): Promise<DurableUploadRecord | null> {
  transport.beforeRequest();
  const result = await paperlessUpload({
    client: transport.client,
    path: { operationId: input.operationId },
    redirect: 'error',
  });
  if (result.response?.status === 404) {
    const absence = zErrorBody.safeParse(result.error);
    if (
      absence.success &&
      absence.data.code === 'documents.upload.not_found' &&
      !absence.data.retryable
    )
      return null;
    throw invalidResponse();
  }
  return readRecord(
    result.response,
    unwrap(result),
    (payload) => zPaperlessUploadResponse.parse(payload).data,
    input
  );
}
