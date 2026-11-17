import { expect, it } from 'vitest';

import { applyCaptureResult, sourceBelongsToTrip } from './result';
import { captureResult, captureSource } from './test-utils';

import type { CaptureHistory } from './editor-types';
import type { CaptureRequest, CaptureSource } from './types';

const timestamp = '2026-11-17T00:00:00.000Z';

function journey(id: number): CaptureSource['journeys'][number] {
  return {
    id,
    tripId: 1,
    name: `Journey ${id}`,
    reference: null,
    notes: '',
    sourceLinks: [],
    buffers: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function leg(
  id: number,
  journeyId: number
): CaptureSource['journeyLegSets'][number]['legs'][number] {
  return {
    id,
    journeyId,
    mode: 'Flight',
    from: { sourceLabel: 'Sydney' },
    to: { sourceLabel: 'Dallas' },
    intention: 'In plan',
    arrangement: 'Booked',
    purchase: 'Purchased',
    operator: 'Qantas',
    service: 'QF 7',
    reference: null,
    notes: '',
    sourceLinks: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function journeySet(id: number): CaptureSource['journeyLegSets'][number] {
  return { journeyId: id, revision: 1, legs: [leg(id * 10, id)] };
}

const createRequest = {
  operationId: 'create-operation',
  command: { kind: 'capture.create', input: { originalText: 'Qantas booking' } },
} satisfies CaptureRequest;

it('accepts journey leg sets only for journeys owned by the requested trip', () => {
  const owned = {
    ...captureSource(),
    journeys: [journey(7)],
    journeyLegSets: [journeySet(7)],
  };

  expect(sourceBelongsToTrip(owned, 1)).toBe(true);
  expect(sourceBelongsToTrip({ ...owned, journeyLegSets: [journeySet(8)] }, 1)).toBe(false);
  expect(
    sourceBelongsToTrip({ ...owned, journeys: [journey(7), { ...journey(8), tripId: 2 }] }, 1)
  ).toBe(false);
});

it('merges a created journey and its complete leg set into the current trip snapshot', () => {
  const created = {
    ...captureSource(),
    journeys: [journey(7)],
    journeyLegSets: [journeySet(7)],
  };
  const result = applyCaptureResult(captureSource(), captureResult(createRequest, created), null);

  expect(result.journeys).toEqual([journey(7)]);
  expect(result.journeyLegSets).toEqual([journeySet(7)]);
});

it('removes only the operation-created journey and leg set after confirmed Undo', () => {
  const existingJourney = journey(4);
  const createdJourney = journey(7);
  const existingSet = journeySet(4);
  const createdSet = journeySet(7);
  const originalSource = {
    ...captureSource(),
    journeys: [existingJourney, createdJourney],
    journeyLegSets: [existingSet, createdSet],
  };
  const inverse: CaptureHistory = {
    operation: { operationId: createRequest.operationId, command: createRequest.command },
    receipt: {
      ...originalSource,
      operationId: createRequest.operationId,
      undoneOperationId: null,
    },
    draft: null,
  };
  const undoRequest: CaptureRequest = {
    operationId: 'undo-operation',
    command: { kind: 'undo', targetOperationId: createRequest.operationId },
    scope: 'capture',
  };
  const current = {
    ...captureSource(),
    journeys: [existingJourney],
    journeyLegSets: [existingSet],
  };
  const result = applyCaptureResult(originalSource, captureResult(undoRequest, current), inverse);

  expect(result.journeys).toEqual([existingJourney]);
  expect(result.journeyLegSets).toEqual([existingSet]);
});
