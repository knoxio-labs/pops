import { PopsError } from '@pops/pillar-express';

import { PaperlessTaskIdSchema } from '../../contract/task-schemas.js';
import { UploadInputSchema } from '../../contract/upload-schemas.js';
import { getPaperlessClient } from '../modules/paperless/index.js';
import {
  isAllowedUploadMimeType,
  resolveMaxUploadBytes,
} from '../modules/paperless/upload-limits.js';
import { paperlessErrors } from '../paperless-errors.js';
import { uploadErrors } from './errors.js';
import { UploadLedger } from './ledger.js';
import { uploadOwner } from './owner.js';
import { projectUploadRecord, refreshUploadTask } from './record.js';
import { UploadSpool } from './spool.js';

import type { UploadInput, UploadRecord } from '../../contract/upload-schemas.js';
import type { DocumentsDb } from '../../db/open-documents-db.js';
import type { UploadRow } from '../../db/schema.js';
import type { PaperlessClient } from '../modules/paperless/client.js';
import type { DispatchGuard } from './dispatch-guard.js';

function checkPolicy(input: UploadInput): void {
  if (input.byteLength > resolveMaxUploadBytes()) uploadErrors.too_large();
  if (!isAllowedUploadMimeType(input.mimeType)) uploadErrors.unsupported_type();
}

/** Durable upload producer. Restart recovery is ledger lookup, never another unproven upstream POST. */
export class DurableUploads {
  private readonly ledger: UploadLedger;
  private readonly spool: UploadSpool;

  constructor(
    db: DocumentsDb,
    spoolDirectory: string,
    private readonly guard: DispatchGuard,
    private readonly client: () => PaperlessClient | null = getPaperlessClient
  ) {
    this.ledger = new UploadLedger(db);
    this.spool = new UploadSpool(spoolDirectory);
  }

  /** Create/replay immutable input. Existing proof remains readable even if the configured owner changes. */
  create(value: UploadInput): UploadRecord {
    const input = UploadInputSchema.parse(value);
    const existing = this.ledger.find(input.operationId);
    if (existing !== undefined) return this.wire(this.ledger.create(input, existing.owner));
    if (!this.guard.available()) uploadErrors.storage();
    const previous = this.guard.find(input.operationId);
    if (previous !== undefined) {
      if (JSON.stringify(previous.input) !== JSON.stringify(input)) uploadErrors.conflict();
      return this.wire(this.ledger.recover(previous.input, previous.owner, previous.claim));
    }
    const configuredOwner = uploadOwner(this.client()) ?? paperlessErrors.not_configured();
    checkPolicy(input);
    return this.wire(this.ledger.create(input, configuredOwner));
  }

  /** Admit validated raw bytes durably; only an unsent operation may acquire content. */
  async content(
    operationId: string,
    mimeType: string,
    bytes: AsyncIterable<Uint8Array>
  ): Promise<UploadRecord> {
    const row = this.row(operationId);
    this.assertOwner(row);
    const input = UploadInputSchema.parse(JSON.parse(row.input));
    if (mimeType !== input.mimeType) uploadErrors.invalid();
    if (row.state !== 'awaiting_content') return this.wire(row);
    if (this.guard.status(row) !== 'clear') return this.wire(row);
    checkPolicy(input);
    try {
      await this.spool.admit(input, bytes);
    } catch (error) {
      if (error instanceof PopsError) throw error;
      return uploadErrors.storage();
    }
    this.assertOwner(row);
    const admitted = this.ledger.admitted(operationId);
    if (admitted.state === 'done' || admitted.state === 'duplicate')
      await this.spool.release(operationId);
    return this.wire(admitted);
  }

  /** Claim before sending exactly once. Replays only return the ledger, including explicit uncertainty. */
  async dispatch(operationId: string): Promise<UploadRecord> {
    const row = this.row(operationId);
    if (row.state !== 'admitted') {
      if (row.state === 'awaiting_content') uploadErrors.conflict();
      return this.wire(row);
    }
    this.assertOwner(row);
    const input = UploadInputSchema.parse(JSON.parse(row.input));
    checkPolicy(input);
    const file = await this.spool.openVerified(input).catch((error: unknown) => {
      if (error instanceof PopsError) throw error;
      return uploadErrors.storage();
    });
    try {
      const client = this.assertOwner(row);
      checkPolicy(input);
      const guardClaim = this.guard.acquire(row);
      if (guardClaim === undefined) return this.wire(this.ledger.get(operationId));
      const claim = this.ledger.claim(operationId, guardClaim);
      if (claim === undefined) return this.wire(this.ledger.get(operationId));
      try {
        const taskId = PaperlessTaskIdSchema.parse(
          await client.postDocument(
            file,
            {
              fileName: input.fileName,
              mimeType: input.mimeType,
              ...(input.title === undefined ? {} : { title: input.title }),
            },
            { redirect: 'manual' }
          )
        );
        return this.wire(this.ledger.accepted(operationId, claim, taskId));
      } catch {
        return this.wire(this.ledger.unknown(operationId, claim));
      }
    } finally {
      await file.close();
    }
  }

  /** Recover retained proof; an unavailable/missing old task never erases a known receipt. */
  async get(operationId: string): Promise<UploadRecord> {
    let row = this.row(operationId);
    row = await refreshUploadTask(this.ledger, row, this.client());
    if ((row.state === 'done' || row.state === 'duplicate') && row.contentAvailable) {
      try {
        await this.spool.release(operationId);
        row = this.ledger.released(operationId);
      } catch {
        /* A retained spool can be released on the next lookup. */
      }
    }
    return this.wire(row);
  }

  private assertOwner(row: UploadRow): PaperlessClient {
    const client = this.client() ?? paperlessErrors.not_configured();
    if (uploadOwner(client) !== row.owner) uploadErrors.owner_changed();
    return client;
  }

  private row(operationId: string): UploadRow {
    const row = this.ledger.find(operationId);
    if (row !== undefined) return row;
    const claim = this.guard.find(operationId);
    return claim === undefined
      ? uploadErrors.not_found()
      : this.ledger.recover(claim.input, claim.owner, claim.claim);
  }

  private wire(row: UploadRow): UploadRecord {
    return projectUploadRecord(row, this.guard, this.client());
  }
}
