import { z } from 'zod';

import { zWriteCreateUploadBody } from '../documents-api/zod.gen';
import { zDocumentAssociationsCreateResponse } from '../trips-api/zod.gen';

import type { UploadPersistenceLease } from '@pops/pillar-sdk';

import type { DurableUploadInput } from './durable-upload-api';
import type { DocumentAssociationTarget } from './types';

/** Exact owner and optional Trips target for one account-scoped upload journal. */
export interface UploadJournalContext {
  tripId: number;
  tripsOrigin: string;
  documentsOrigin: string;
  target: DocumentAssociationTarget | null;
}

const identitySchema = z.strictObject({
  account: z.string().min(1),
  server: z.string().min(1),
  epoch: z.string().min(1),
});
const association = zDocumentAssociationsCreateResponse.shape;
const contextSchema = z.strictObject({
  tripId: association.tripId,
  tripsOrigin: z.string().min(1),
  documentsOrigin: z.string().min(1),
  target: z.strictObject({ kind: association.targetKind, id: association.targetId }).nullable(),
});
const inputSchema = zWriteCreateUploadBody.omit({ title: true });
const journalSchema = z.strictObject({
  version: z.literal(1),
  context: contextSchema,
  input: inputSchema,
});

/** Persist only immutable owner inputs; every read and mutation requires the captured live lease. */
export class UploadJournal {
  private readonly context: UploadJournalContext;
  private readonly key: string;
  private readonly identity: string;
  private valid = true;

  constructor(
    private readonly lease: UploadPersistenceLease,
    context: UploadJournalContext
  ) {
    this.identity = JSON.stringify(identitySchema.parse(lease.identity));
    this.context = contextSchema.parse(context);
    this.key = JSON.stringify(this.context);
    this.assertCurrent();
  }

  /** Opaque equality boundary for rebinding a view to the same account, epoch and explicit owner context. */
  bindingKey(): string {
    return JSON.stringify([this.identity, this.key]);
  }

  /** Require the live configured transport to name this journal's original Documents owner. */
  assertDocumentsOwner(origin: string | null): void {
    this.assertCurrent();
    if (origin !== this.context.documentsOrigin)
      throw new Error('The upload journal belongs to another Documents owner.');
  }

  /** Require the original explicit Trip/source binding before dispatching contextual actions. */
  assertTarget(
    tripId: number,
    target: DocumentAssociationTarget,
    tripsOrigin: string | null
  ): void {
    this.assertCurrent();
    const bound = this.context.target;
    if (
      bound === null ||
      tripId !== this.context.tripId ||
      tripsOrigin !== this.context.tripsOrigin ||
      bound.kind !== target.kind ||
      bound.id !== target.id
    )
      throw new Error('The upload journal belongs to another Trips source.');
  }

  /** Require the original unbound Capture Trip and actual source owner before admitting its references. */
  assertCapture(tripId: number, tripsOrigin: string | null): void {
    this.assertCurrent();
    if (
      this.context.target !== null ||
      tripId !== this.context.tripId ||
      tripsOrigin !== this.context.tripsOrigin
    )
      throw new Error('The upload journal belongs to another Capture context.');
  }

  /** Reject retired, unknown or replaced account/server epochs before accessing metadata. */
  assertCurrent(): void {
    if (
      !this.valid ||
      !this.lease.isCurrent() ||
      JSON.stringify(identitySchema.parse(this.lease.identity)) !== this.identity
    ) {
      throw new Error('The upload journal account is no longer current.');
    }
  }

  /** Reverify server authority and then require the same captured account/server epoch. */
  async verify(): Promise<void> {
    try {
      if (JSON.stringify(identitySchema.parse(this.lease.identity)) !== this.identity)
        throw new Error('The upload journal account is no longer current.');
      await this.lease.verify();
      if (
        !this.lease.isCurrent() ||
        JSON.stringify(identitySchema.parse(this.lease.identity)) !== this.identity
      )
        throw new Error('The upload journal account is no longer current.');
      this.valid = true;
    } catch (error) {
      this.valid = false;
      throw error;
    }
  }

  /** Observe an actual authorization loss without allowing an older request to invalidate a newer account. */
  invalidate(): void {
    this.valid = false;
    this.lease.invalidate();
  }

  /** Read detached canonical inputs from current storage without retaining a mutable cached copy. */
  list(): readonly DurableUploadInput[] {
    this.assertCurrent();
    const entries: DurableUploadInput[] = [];
    for (const key of this.lease.keys()) {
      if (!key.startsWith(`${this.key}:`)) continue;
      const input = this.read(key);
      if (input !== null) entries.push(input);
    }
    this.assertCurrent();
    return structuredClone(entries);
  }

  /** Persist and read back this exact UUID and body before any owner write is allowed. */
  admit(input: DurableUploadInput): void {
    this.assertCurrent();
    const canonical = inputSchema.parse(input);
    const key = this.operationKey(canonical.operationId);
    const existing = this.read(key);
    if (existing !== null) {
      if (JSON.stringify(existing) !== JSON.stringify(canonical))
        throw new Error('The upload journal operation has different immutable input.');
      return;
    }
    this.persist(key, canonical);
  }

  /** Remove only this operation from this exact context after independently confirmed completion. */
  complete(operationId: string): void {
    const key = this.operationKey(operationId);
    if (this.read(key) === null) return;
    this.assertCurrent();
    this.lease.remove(key);
    this.assertCurrent();
    if (this.lease.read(key) !== null)
      throw new Error('The upload journal completion could not be confirmed.');
    this.assertCurrent();
  }

  private operationKey(operationId: string): string {
    return `${this.key}:${operationId}`;
  }

  private read(key: string): DurableUploadInput | null {
    this.assertCurrent();
    const stored = this.lease.read(key);
    this.assertCurrent();
    if (stored === null) return null;
    const payload: unknown = JSON.parse(stored);
    const journal = journalSchema.parse(payload);
    if (
      JSON.stringify(journal.context) !== this.key ||
      this.operationKey(journal.input.operationId) !== key
    )
      throw new Error('The upload journal belongs to another operation or context.');
    return journal.input;
  }

  private persist(key: string, input: DurableUploadInput): void {
    const serialized = JSON.stringify({ version: 1, context: this.context, input });
    this.assertCurrent();
    this.lease.write(key, serialized);
    this.assertCurrent();
    if (this.lease.read(key) !== serialized)
      throw new Error('The upload journal write could not be confirmed.');
    this.assertCurrent();
  }
}
