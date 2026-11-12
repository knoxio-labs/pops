import { expect, it } from 'vitest';

import { ownRecordSuccessor } from './record-successor';
import { sourceCapture } from './test-utils';

it('accepts only a strict unchanged own receipt successor', () => {
  const row = sourceCapture({ revision: 2, notes: 'Own note' });
  const proof = {
    revision: 1,
    input: { notes: 'Own note' },
    receipt: row,
    current: row,
    tripId: 1,
  };
  expect(ownRecordSuccessor(proof)).toEqual(row);
  expect(ownRecordSuccessor({ ...proof, current: { ...row, revision: 3 } })).toBeUndefined();
  expect(ownRecordSuccessor({ ...proof, current: { ...row, notes: 'Foreign' } })).toBeUndefined();
  expect(ownRecordSuccessor({ ...proof, input: { notes: 'Other' } })).toBeUndefined();
  for (const invalid of [
    { ...row, tripId: 2 },
    { ...row, revision: 1 },
    { ...row, revision: 3 },
    { ...row, removedAt: row.updatedAt },
  ])
    expect(ownRecordSuccessor({ ...proof, receipt: invalid, current: invalid })).toBeUndefined();
  expect(ownRecordSuccessor({ ...proof, receipt: undefined })).toBeUndefined();
  expect(ownRecordSuccessor({ ...proof, current: undefined })).toBeUndefined();
});
