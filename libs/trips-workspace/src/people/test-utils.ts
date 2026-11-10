import type { MeetingOperation, MeetingPlan, MeetingResult } from './types';

/** Fictional source facts preserve intentionally partial or contradictory meeting dates. */
export function meetingPlan(patch: Partial<MeetingPlan> = {}): MeetingPlan {
  return {
    id: 41,
    tripId: 7,
    revision: 1,
    removed: false,
    contactUri: 'pops:contacts/contact/owner-issued',
    visitId: null,
    title: 'Coffee',
    notes: '',
    intention: 'Considering',
    agreement: 'Not agreed',
    startDate: null,
    endDate: '2030-01-03',
    createdAt: '2029-01-01T00:00:00Z',
    updatedAt: '2029-01-01T00:00:00Z',
    ...patch,
  };
}

/** An explicit operation response, without simulating producer validation in consumer tests. */
export function meetingResult(
  operation: MeetingOperation,
  before: MeetingPlan | null,
  after: MeetingPlan
): MeetingResult {
  return {
    receipt: {
      operationId: operation.operationId,
      undoneOperationId:
        operation.command.kind === 'undo' ? operation.command.targetOperationId : null,
      before,
      after,
    },
    current: after,
    replayed: false,
    undone: false,
  };
}
