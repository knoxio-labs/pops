import {
  acceptedUploadRecord,
  completedUploadRecord,
  pendingUploadRecord,
  unknownUploadRecord,
  uploadWireProof,
} from './durable-upload-wire-test-records';

import type {
  PendingUploadDispatch,
  PendingUploadRead,
  UploadWireRoute,
  UploadWireState,
} from './durable-upload-wire-test-types';

function dispatchControl(
  state: UploadWireState,
  route: UploadWireRoute,
  resolve: (response: Response) => void,
  reject: (error: Error) => void
): PendingUploadDispatch {
  return {
    input: route.record.input,
    accept: (taskId = state.options.taskId ?? 'first-task'): void => {
      const next = acceptedUploadRecord(route.record, taskId);
      state.records.set(route.operationId, next);
      resolve(uploadWireProof(next));
    },
    fail: (error): void => {
      state.records.set(route.operationId, unknownUploadRecord(route.record));
      reject(error);
    },
    reject: (status, body): void => resolve(Response.json(body, { status })),
  };
}

function readControl(
  state: UploadWireState,
  route: UploadWireRoute,
  resolve: (response: Response) => void,
  reject: (error: Error) => void
): PendingUploadRead {
  return {
    input: route.record.input,
    pending: (): void => resolve(uploadWireProof(pendingUploadRecord(route.record))),
    done: (documentId): void => {
      const next = completedUploadRecord(route.record, documentId);
      state.records.set(route.operationId, next);
      resolve(uploadWireProof(next));
    },
    reply: (next): void => {
      state.records.set(route.operationId, next);
      resolve(uploadWireProof(next));
    },
    malformed: (payload, status = 200): void => resolve(Response.json(payload, { status })),
    fail: reject,
  };
}

/** Resolve or defer one actual dispatch while retaining its original request UUID and input. */
export function dispatchUploadResponse(
  state: UploadWireState,
  route: UploadWireRoute
): Response | Promise<Response> {
  if (state.options.deferDispatch === false) {
    const next = acceptedUploadRecord(route.record, state.options.taskId ?? 'first-task');
    state.records.set(route.operationId, next);
    return uploadWireProof(next);
  }
  return new Promise<Response>((resolve, reject) => {
    state.dispatches.push(dispatchControl(state, route, resolve, reject));
  });
}

/** Resolve or defer owner GET proof without permitting an unsuccessful read to change the ledger. */
export function readUploadResponse(
  state: UploadWireState,
  route: UploadWireRoute
): Response | Promise<Response> {
  if (state.readFailure) throw new Error('Durable owner unavailable.');
  if (state.options.deferReads)
    return new Promise<Response>((resolve, reject) => {
      state.reads.push(readControl(state, route, resolve, reject));
    });
  const result =
    route.record.taskId !== null && state.options.readState !== 'accepted'
      ? completedUploadRecord(route.record, state.options.documentId ?? 91)
      : route.record;
  state.records.set(route.operationId, result);
  return uploadWireProof(result);
}
