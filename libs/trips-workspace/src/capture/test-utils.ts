import type { Capture, CaptureRequest, CaptureResult, CaptureSource } from './types';

/** Empty owner snapshot for state-machine boundary tests. */
export function captureSource(captures: Capture[] = []): CaptureSource {
  return {
    captures,
    ideas: [],
    associations: [],
    memberships: [],
    events: [],
    journeys: [],
    stays: [],
  };
}
/** Explicit source row without inferred fields. */
export function sourceCapture(fields: Partial<Capture> = {}): Capture {
  return {
    id: 1,
    tripId: 1,
    originalText: 'Raw source',
    originalUrl: null,
    title: null,
    notes: '',
    classification: null,
    placeId: null,
    visitId: null,
    attachments: [],
    revision: 1,
    removedAt: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...fields,
  };
}
/** An independent source Idea with no implicit classification, dates or route membership. */
export function sourceIdea(
  fields: Partial<CaptureSource['ideas'][number]> = {}
): CaptureSource['ideas'][number] {
  return {
    id: 1,
    tripId: 1,
    name: null,
    kind: null,
    purpose: null,
    status: null,
    reason: '',
    notes: '',
    address: null,
    placeId: null,
    visitId: null,
    timing: { mode: 'none' },
    sourceLinks: [],
    contactLinks: [],
    recommendations: [],
    revision: 1,
    removedAt: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...fields,
  };
}
/** Actual source Event identity and independent optional visit used by Explore boundary tests. */
export function sourceEvent(
  fields: Partial<CaptureSource['events'][number]> = {}
): CaptureSource['events'][number] {
  return {
    id: 7,
    tripId: 1,
    visitId: 3,
    name: 'Show',
    intention: null,
    arrangement: null,
    purchase: null,
    timing: {},
    address: null,
    reference: null,
    sourceUrl: null,
    ticketUrl: null,
    notes: 'Original note',
    sourceLinks: [],
    venueLinks: [],
    organiserLinks: [],
    documentLinks: [],
    createdAt: '',
    updatedAt: '',
    ...fields,
  };
}
/** Return one request-bound receipt while letting tests distinguish original outcome from current state. */
export function captureResult(
  request: CaptureRequest,
  current: CaptureSource = captureSource()
): CaptureResult {
  return {
    receipt: {
      ...current,
      operationId: request.operationId,
      undoneOperationId: 'scope' in request ? request.command.targetOperationId : null,
    },
    current,
    replayed: false,
    undone: false,
  };
}
/** Controllable network boundary that never invents a response before the test resolves it. */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve: (value: T) => void = () => {
    throw new Error('Not started');
  };
  let reject: (error: Error) => void = () => {
    throw new Error('Not started');
  };
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
