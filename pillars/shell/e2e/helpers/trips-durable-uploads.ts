import { createHash } from 'node:crypto';

import { expect } from '@playwright/test';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { assertMatchesContract, json } from './pillar-rest';

import type { Page } from '@playwright/test';

// Mirrors UploadInputSchema in pillars/documents/src/contract/upload-schemas.ts.
const inputSchema = z.strictObject({
  operationId: z.uuid(),
  fileName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\\p{Cc}]+$/u)
    .refine((name) => name !== '.' && name !== '..'),
  title: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^\p{Cc}]+$/u)
    .optional(),
  mimeType: z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/),
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
type UploadInput = z.infer<typeof inputSchema>;
const shared = { input: inputSchema, ownerMatches: z.literal(true), reason: z.null() };
const unsent = { ...shared, taskId: z.null(), documentId: z.null() };
const taskId = z.string().regex(/^[A-Za-z0-9_-]{1,72}$/);
// Only the UploadRecordSchema states exercised by these owner fixtures.
const recordSchema = z.discriminatedUnion('state', [
  z.strictObject({
    ...unsent,
    state: z.literal('awaiting_content'),
    contentAvailable: z.literal(false),
  }),
  z.strictObject({ ...unsent, state: z.literal('admitted'), contentAvailable: z.literal(true) }),
  z.strictObject({
    ...shared,
    state: z.literal('accepted'),
    contentAvailable: z.literal(true),
    taskId,
    documentId: z.null(),
  }),
  z.strictObject({
    ...shared,
    state: z.literal('done'),
    contentAvailable: z.literal(true),
    taskId,
    documentId: z.number().int().positive(),
  }),
  z.strictObject({
    ...shared,
    state: z.literal('failed'),
    contentAvailable: z.literal(true),
    taskId,
    documentId: z.null(),
    reason: z.string().nullable(),
  }),
]);
type UploadRecord = z.infer<typeof recordSchema>;

/** Explicit owner lookup outcomes for the durable GET, independent of admission and dispatch. */
export type DurableUploadRead =
  | { state: 'unavailable' }
  | { state: 'pending' }
  | { state: 'failed'; reason: string }
  | { state: 'done'; documentId: number };

/** Controls the published upload protocol while preserving each browser-selected operation identity. */
export interface DurableUploadOwnerOptions {
  admit: (input: UploadInput) => string;
  read: (input: UploadInput, taskId: string, url: string) => DurableUploadRead;
  content?: (input: UploadInput, bytes: Buffer) => void;
  dispatch?: (input: UploadInput, taskId: string) => void | Promise<void>;
}

/** Serve JSON admission, verified raw bytes, one dispatch and exact UUID recovery; legacy upload routes stay unstubbed. */
export async function stubDurableUploadOwner(
  page: Page,
  options: DurableUploadOwnerOptions
): Promise<void> {
  const operations = new Map<string, { record: UploadRecord; taskId: string }>();
  const proof = (record: UploadRecord) => {
    assertMatchesContract(recordSchema, record, 'durable upload record');
    return { data: record };
  };
  await page.route(
    /^https?:\/\/[^/]+\/documents-api\/paperless\/uploads(?:\/[^/?]+(?:\/(?:content|dispatch))?)?$/,
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/uploads') && request.method() === 'POST') {
        const input = inputSchema.parse(request.postDataJSON());
        const existing = operations.get(input.operationId);
        if (existing) {
          expect(input).toEqual(existing.record.input);
          await json(route, 200, proof(existing.record));
          return;
        }
        const acceptedTaskId = options.admit(input);
        const record: UploadRecord = {
          input,
          ownerMatches: true,
          state: 'awaiting_content',
          contentAvailable: false,
          taskId: null,
          documentId: null,
          reason: null,
        };
        operations.set(input.operationId, { record, taskId: taskId.parse(acceptedTaskId) });
        await json(route, 200, proof(record));
        return;
      }
      const match = /\/uploads\/([^/]+)(?:\/(content|dispatch))?$/.exec(path);
      const operation = operations.get(z.uuid().parse(match?.[1]));
      if (!operation) throw new Error('Unknown durable upload operation');
      const input = operation.record.input;
      if (match?.[2] === 'content' && request.method() === 'PUT') {
        expect(operation.record.state).toBe('awaiting_content');
        const bytes = request.postDataBuffer();
        if (bytes === null) throw new Error('Missing original upload bytes');
        expect(request.headers()['content-type']).toBe(input.mimeType);
        expect(bytes.byteLength).toBe(input.byteLength);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(input.sha256);
        options.content?.(input, bytes);
        operation.record = { ...inputRecord(input), state: 'admitted', contentAvailable: true };
      } else if (match?.[2] === 'dispatch' && request.method() === 'POST') {
        expect(operation.record.state).toBe('admitted');
        await options.dispatch?.(input, operation.taskId);
        operation.record = {
          ...inputRecord(input),
          state: 'accepted',
          contentAvailable: true,
          taskId: operation.taskId,
        };
      } else if (match?.[2] === undefined && request.method() === 'GET') {
        if (operation.record.state === 'accepted') {
          const result = options.read(input, operation.taskId, request.url());
          if (result.state === 'unavailable') {
            const failure = {
              code: 'documents.upload.storage',
              message: 'Durable upload storage is unavailable.',
              requestId: 'durable-upload-browser-test',
              retryable: true,
            };
            assertMatchesContract(ErrorBodySchema, failure, 'durable upload storage failure');
            await json(route, 503, failure);
            return;
          }
          if (result.state === 'done') {
            operation.record = {
              ...inputRecord(input),
              state: 'done',
              contentAvailable: true,
              taskId: operation.taskId,
              documentId: result.documentId,
            };
          }
          if (result.state === 'failed') {
            operation.record = {
              ...inputRecord(input),
              state: 'failed',
              contentAvailable: true,
              taskId: operation.taskId,
              reason: result.reason,
            };
          }
        }
      } else {
        await route.fallback();
        return;
      }
      await json(route, 200, proof(operation.record));
    }
  );
}

function inputRecord(input: UploadInput) {
  return { input, ownerMatches: true as const, taskId: null, documentId: null, reason: null };
}
