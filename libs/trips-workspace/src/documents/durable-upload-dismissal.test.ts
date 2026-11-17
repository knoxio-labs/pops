// @vitest-environment node
import { expect, it } from 'vitest';

import { createClient } from '../documents-api/client';
import { DurableUploadOperation } from './durable-upload-operation';
import { createTestUploadJournal } from './durable-upload-test-utils';

import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';

const input: DurableUploadInput = {
  operationId: 'ab88a8e8-f685-4d47-8d4c-a7e3eb8fdb08',
  fileName: 'booking.pdf',
  mimeType: 'application/pdf',
  byteLength: 3,
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
};
const common = { input, ownerMatches: true, reason: null, taskId: null, documentId: null };
const protectedRecords: DurableUploadRecord[] = [
  { ...common, state: 'awaiting_content', contentAvailable: false },
  { ...common, state: 'admitted', contentAvailable: true },
  { ...common, state: 'accepted', contentAvailable: true, taskId: 'accepted-task' },
  { ...common, state: 'outcome_unknown', contentAvailable: true, blockedBy: 'dispatch_unproven' },
  {
    ...common,
    state: 'failed',
    contentAvailable: true,
    taskId: 'foreign-task',
    ownerMatches: false,
  },
];

it.each(protectedRecords)(
  'refuses explicit dismissal of $state proof without discarding its exact journal descriptor',
  async (record) => {
    const persistence = createTestUploadJournal();
    persistence.journal.admit(input);
    const operation = DurableUploadOperation.restore(input, persistence.journal);
    const client = createClient({
      baseUrl: 'https://owner-a.test/documents-api',
      fetch: async () => Response.json({ data: record }),
    });
    await operation.recover({ client, beforeRequest: () => undefined });
    await expect(operation.dismissFailed()).rejects.toThrow('Only a confirmed failed upload');
    expect(persistence.journal.list()).toEqual([input]);
  }
);

it('does not discard a restored descriptor before any current owner proof is received', async () => {
  const persistence = createTestUploadJournal();
  persistence.journal.admit(input);
  const operation = DurableUploadOperation.restore(input, persistence.journal);
  await expect(operation.dismissFailed()).rejects.toThrow('Only a confirmed failed upload');
  expect(persistence.journal.list()).toEqual([input]);
});

it('retains a proven failed descriptor until explicit dismissal and leaves another operation intact', async () => {
  const persistence = createTestUploadJournal();
  const unrelated = { ...input, operationId: 'b4fa188d-6b8b-4070-9067-e3787571c3de' };
  persistence.journal.admit(input);
  persistence.journal.admit(unrelated);
  const operation = DurableUploadOperation.restore(input, persistence.journal);
  const failed: DurableUploadRecord = {
    ...common,
    state: 'failed',
    contentAvailable: true,
    taskId: 'failed-task',
    reason: 'Unsupported file type',
  };
  const client = createClient({
    baseUrl: 'https://owner-a.test/documents-api',
    fetch: async () => Response.json({ data: failed }),
  });
  await operation.recover({ client, beforeRequest: () => undefined });
  expect(persistence.journal.list()).toEqual([input, unrelated]);
  await operation.dismissFailed();
  expect(persistence.journal.list()).toEqual([unrelated]);
});

it('preserves failed metadata when later owner evidence cannot confirm the archive', async () => {
  const persistence = createTestUploadJournal();
  persistence.journal.admit(input);
  const operation = DurableUploadOperation.restore(input, persistence.journal);
  let record: DurableUploadRecord = {
    ...common,
    state: 'failed',
    contentAvailable: true,
    taskId: 'failed-task',
  };
  const client = createClient({
    baseUrl: 'https://owner-a.test/documents-api',
    fetch: async () => Response.json({ data: record }),
  });
  await operation.recover({ client, beforeRequest: () => undefined });
  record = {
    ...common,
    ownerMatches: false,
    state: 'outcome_unknown',
    contentAvailable: false,
    blockedBy: 'guard_unavailable',
  };
  await operation.recover({ client, beforeRequest: () => undefined });
  expect(operation.readRecord()?.state).toBe('failed');
  expect(operation.ownerMatches()).toBe(false);
  await expect(operation.dismissFailed()).rejects.toThrow('Only a confirmed failed upload');
  expect(persistence.journal.list()).toEqual([input]);
});

it.each(['dispatch_unproven', 'restored_history', 'guard_unavailable'] as const)(
  'retains prior failed proof when the current owner reports %s uncertainty',
  async (blockedBy) => {
    const persistence = createTestUploadJournal();
    persistence.journal.admit(input);
    const operation = DurableUploadOperation.restore(input, persistence.journal);
    let record: DurableUploadRecord = {
      ...common,
      state: 'failed',
      contentAvailable: true,
      taskId: 'failed-task',
    };
    const client = createClient({
      baseUrl: 'https://owner-a.test/documents-api',
      fetch: async () => Response.json({ data: record }),
    });
    await operation.recover({ client, beforeRequest: () => undefined });
    record = { ...common, state: 'outcome_unknown', contentAvailable: false, blockedBy };
    await operation.recover({ client, beforeRequest: () => undefined });
    expect(operation.readRecord()?.state).toBe('failed');
    expect(operation.ownerMatches()).toBe(true);
    await expect(operation.dismissFailed()).rejects.toThrow('Only a confirmed failed upload');
    expect(persistence.journal.list()).toEqual([input]);
  }
);
