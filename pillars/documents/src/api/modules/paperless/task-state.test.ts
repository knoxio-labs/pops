import { describe, expect, it } from 'vitest';

import { mapPaperlessTask, RawTaskPageSchema } from './task-state.js';

type Status = 'pending' | 'started' | 'success' | 'failure' | 'revoked';

function task(status: Status, resultData: Record<string, unknown> | null) {
  return { task_id: 't', status, result_data: resultData };
}

describe('mapPaperlessTask', () => {
  it('reads a duplicate (Paperless records it as failure) before the generic failure', () => {
    expect(
      mapPaperlessTask(task('failure', { duplicate_of: 9, duplicate_in_trash: false }))
    ).toEqual({
      state: 'duplicate',
      documentId: 9,
      reason: null,
    });
  });

  it('says when the duplicate it points at is in the trash', () => {
    expect(
      mapPaperlessTask(task('failure', { duplicate_of: 9, duplicate_in_trash: true }))
    ).toEqual({
      state: 'duplicate',
      documentId: 9,
      reason: 'The existing document is in the Paperless trash.',
    });
  });

  it('treats a success with no document id (a stopped consume) as failed, with its reason', () => {
    expect(mapPaperlessTask(task('success', { reason: 'Barcode splitting complete!' }))).toEqual({
      state: 'failed',
      documentId: null,
      reason: 'Barcode splitting complete!',
    });
    expect(mapPaperlessTask(task('success', null)).state).toBe('failed');
  });

  it('fails a revoked task and a failure without a message', () => {
    expect(mapPaperlessTask(task('revoked', null))).toEqual({
      state: 'failed',
      documentId: null,
      reason: 'The Paperless task was cancelled.',
    });
    expect(mapPaperlessTask(task('failure', null)).reason).toBe(
      'Paperless could not consume the document.'
    );
  });

  it('ignores a document id that is not a positive integer', () => {
    expect(mapPaperlessTask(task('success', { document_id: '41' })).state).toBe('failed');
    expect(mapPaperlessTask(task('failure', { duplicate_of: 0 })).state).toBe('failed');
  });

  it('caps a long failure reason at 500 characters', () => {
    const mapped = mapPaperlessTask(task('failure', { error_message: 'e'.repeat(2000) }));
    expect(mapped.reason).toHaveLength(500);
  });
});

describe('RawTaskPageSchema', () => {
  it('rejects the v9 upper-case status, so a version downgrade cannot be misread', () => {
    const page = { results: [{ task_id: 't', status: 'SUCCESS', result_data: null }] };
    expect(RawTaskPageSchema.safeParse(page).success).toBe(false);
  });
});
