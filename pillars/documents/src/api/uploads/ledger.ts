import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { UploadInputSchema, UploadParamsSchema } from '../../contract/upload-schemas.js';
import { uploads } from '../../db/schema.js';
import { uploadErrors } from './errors.js';

import type { UploadInput } from '../../contract/upload-schemas.js';
import type { DocumentsDb } from '../../db/open-documents-db.js';
import type { UploadRow } from '../../db/schema.js';

/** SQLite state transitions, including the irreversible durable claim before the upstream POST. */
export class UploadLedger {
  constructor(private readonly db: DocumentsDb) {}

  /** Resolve only a validated UUID; an unknown operation is distinct from an unavailable upstream task. */
  get(operationId: string): UploadRow {
    return this.find(operationId) ?? uploadErrors.not_found();
  }

  /** Resolve a validated identity without requiring a configured upstream for replay. */
  find(operationId: string): UploadRow | undefined {
    if (!UploadParamsSchema.safeParse({ operationId }).success) return uploadErrors.invalid();
    return this.db.select().from(uploads).where(eq(uploads.operationId, operationId)).get();
  }

  /** Atomically insert immutable metadata, or reject conflicting reuse without changing old proof. */
  create(input: UploadInput, owner: string): UploadRow {
    const now = new Date().toISOString();
    this.db
      .insert(uploads)
      .values({
        operationId: input.operationId,
        owner,
        input: JSON.stringify(input),
        state: 'awaiting_content',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
    const row = this.get(input.operationId);
    const original = UploadInputSchema.parse(JSON.parse(row.input));
    if (
      original.fileName !== input.fileName ||
      original.title !== input.title ||
      original.mimeType !== input.mimeType ||
      original.byteLength !== input.byteLength ||
      original.sha256 !== input.sha256
    )
      uploadErrors.conflict();
    return row;
  }

  /** Restore only uncertainty from independent dispatch history, without inventing accepted task/original IDs. */
  recover(input: UploadInput, owner: string, claim: string): UploadRow {
    const now = new Date().toISOString();
    this.db
      .insert(uploads)
      .values({
        operationId: input.operationId,
        owner,
        input: JSON.stringify(input),
        state: 'outcome_unknown',
        claim,
        createdAt: now,
        updatedAt: now,
        contentAvailable: false,
      })
      .onConflictDoNothing()
      .run();
    return this.get(input.operationId);
  }

  /** Mark only the original waiting intent as admitted, after durable spool publication. */
  admitted(operationId: string): UploadRow {
    this.db
      .update(uploads)
      .set({ state: 'admitted', contentAvailable: true, updatedAt: new Date().toISOString() })
      .where(and(eq(uploads.operationId, operationId), eq(uploads.state, 'awaiting_content')))
      .run();
    return this.get(operationId);
  }

  /** Exactly one caller can claim an admitted operation; the claim is never reset on restart. */
  claim(operationId: string, claim: string = randomUUID()): string | undefined {
    const result = this.db
      .update(uploads)
      .set({ state: 'dispatching', claim, updatedAt: new Date().toISOString() })
      .where(and(eq(uploads.operationId, operationId), eq(uploads.state, 'admitted')))
      .run();
    return result.changes === 1 ? claim : undefined;
  }

  /** A late validated response may settle only the exact original dispatch claim. */
  accepted(operationId: string, claim: string, taskId: string): UploadRow {
    this.db
      .update(uploads)
      .set({ state: 'accepted', taskId, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(uploads.operationId, operationId),
          eq(uploads.claim, claim),
          eq(uploads.state, 'dispatching')
        )
      )
      .run();
    return this.get(operationId);
  }

  /** Record ambiguity without permitting another claim or destroying any known receipt. */
  unknown(operationId: string, claim: string): UploadRow {
    this.db
      .update(uploads)
      .set({ state: 'outcome_unknown', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(uploads.operationId, operationId),
          eq(uploads.claim, claim),
          eq(uploads.state, 'dispatching')
        )
      )
      .run();
    return this.get(operationId);
  }

  /** Persist terminal task proof before bytes may be released; an unavailable/missing task does not call this. */
  complete(
    row: UploadRow,
    result: {
      state: 'done' | 'duplicate' | 'failed';
      documentId: number | null;
      reason: string | null;
    }
  ): UploadRow {
    this.db
      .update(uploads)
      .set({ ...result, updatedAt: new Date().toISOString() })
      .where(and(eq(uploads.operationId, row.operationId), eq(uploads.state, 'accepted')))
      .run();
    return this.get(row.operationId);
  }

  /** A durable original document is sufficient to release its spool, while the receipt row remains. */
  released(operationId: string): UploadRow {
    this.db
      .update(uploads)
      .set({ contentAvailable: false })
      .where(and(eq(uploads.operationId, operationId), eq(uploads.contentAvailable, true)))
      .run();
    return this.get(operationId);
  }
}
