import type { DocumentUploadHostCapability } from '@pops/pillar-sdk';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { ErrorBody } from '../documents-api/types.gen';
import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';
import type { UploadJournal, UploadJournalContext } from './durable-upload-journal';
import type { TestUploadJournal } from './durable-upload-test-utils';
import type { PaperlessSearchDocument } from './types';

/** Controlled owner acknowledgement for one actually received durable dispatch request. */
export interface PendingUploadDispatch {
  readonly input: DurableUploadInput;
  accept(taskId?: string): void;
  fail(error: Error): void;
  reject(status: number, body: ErrorBody): void;
}

/** Controlled GET proof retaining the immutable input and task identity actually recorded by this owner. */
export interface PendingUploadRead {
  readonly input: DurableUploadInput;
  pending(): void;
  done(documentId: number): void;
  reply(record: DurableUploadRecord): void;
  malformed(payload: unknown, status?: number): void;
  fail(error: Error): void;
}

/** Owner response controls, independent of labels and selected File object identity. */
export interface DurableUploadWireOptions {
  baseUrl?: string;
  deferDispatch?: boolean;
  deferReads?: boolean;
  taskId?: string;
  documentId?: number;
  readState?: 'accepted' | 'done';
  searchResults?: PaperlessSearchDocument[];
}

/** Actual transport, canonical ledger and verified metadata authority shared by UI tests. */
export interface DurableUploadWire {
  client: DocumentsClient;
  requests: Request[];
  records: Map<string, DurableUploadRecord>;
  dispatches: PendingUploadDispatch[];
  reads: PendingUploadRead[];
  persistence: TestUploadJournal;
  host: DocumentUploadHostCapability;
  createJournal(context: UploadJournalContext): UploadJournal;
  createCount(): number;
  putCount(): number;
  dispatchCount(): number;
  failReads(): void;
  restoreReads(): void;
}

/** Mutable controlled-owner state; routing remains keyed by actual received operation UUID. */
export interface UploadWireState {
  options: DurableUploadWireOptions;
  requests: Request[];
  records: Map<string, DurableUploadRecord>;
  dispatches: PendingUploadDispatch[];
  reads: PendingUploadRead[];
  readFailure: boolean;
}

/** Captured request route and ledger row, kept independent of any returned payload's input UUID. */
export interface UploadWireRoute {
  operationId: string;
  record: DurableUploadRecord;
  action: string | undefined;
}
