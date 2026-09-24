import { EVERYDAY_ACCOUNT_ID } from './accounts';

import type {
  AccountImportsGetConfigResponses,
  AccountImportsListBatchesResponses,
  ImportDraftsListResponses,
  ImportsGetImportProgressResponses,
} from '../../finance-api/types.gen';

/**
 * The everyday account's import history, and the import that is still open.
 *
 * August's committed batch holds four rows of a five-row file: the fifth was
 * a duplicate of a row an earlier batch already wrote, and the dedup key
 * skipped it. The pending draft is the same shape one month on, parked with
 * one row still unresolved — and its processing result carries the skipped
 * row with the reason, which is what the import wizard's review step shows.
 */

export const IMPORT_DRAFT_ID = 'draft-everyday-sep';

export const IMPORT_CONFIG: AccountImportsGetConfigResponses[200]['data'] = {
  accountId: EVERYDAY_ACCOUNT_ID,
  sourceKind: 'csv-dialect',
  dialectId: 'kestrel-csv',
  parserId: null,
  provider: null,
  externalAccountRef: null,
  secretRef: null,
  expectedCadenceDays: 30,
  createdAt: '2026-01-12T08:00:00.000Z',
  updatedAt: '2026-09-01T07:30:00.000Z',
};

export const IMPORT_BATCHES: AccountImportsListBatchesResponses[200]['data'] = [
  {
    id: 'imp-everyday-aug',
    accountId: EVERYDAY_ACCOUNT_ID,
    sourceKind: 'csv-dialect',
    sourceRef: 'kestrel-2026-08.csv',
    parserVersion: 'kestrel-csv@3',
    rowCount: 4,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    checkpointId: 'chk-everyday-aug',
    commitKey: 'commit-everyday-aug',
    createdAt: '2026-09-01T07:30:00.000Z',
  },
];

export const IMPORT_DRAFTS: ImportDraftsListResponses[200]['data'] = [
  {
    id: IMPORT_DRAFT_ID,
    accountId: EVERYDAY_ACCOUNT_ID,
    source: { kind: 'file', dialectId: 'kestrel-csv', fileNames: ['kestrel-2026-09.csv'] },
    state: 'saved',
    step: 3,
    rowCount: 5,
    unresolvedCount: 1,
    balanceReportedCents: 318_420,
    span: { from: '2026-09-01', to: '2026-09-04' },
    processSessionId: 'session-everyday-sep',
    ownerSeenAt: null,
    unusableCause: null,
    unusableReason: null,
    createdAt: '2026-09-05T08:00:00.000Z',
    savedAt: '2026-09-05T08:10:00.000Z',
  },
];

type ProcessedRow = NonNullable<
  NonNullable<ImportsGetImportProgressResponses[200]>['result']
>['skipped'][number];

const SKIPPED_ROW: ProcessedRow = {
  status: 'skipped',
  skipReason: 'Duplicate of a transaction already imported on 22 Aug',
  checksum: 'sha256:hbr-0822-4210',
  date: '2026-08-22',
  amount: -42.1,
  description: 'HARBOUR GROCER WHARF ST',
  dialectAccountLabel: 'Everyday',
  rawRow: '22/08/2026,"HARBOUR GROCER WHARF ST",-42.10',
  entity: { matchType: 'alias', entityName: 'Harbour Grocer' },
};

const MATCHED_ROW: ProcessedRow = {
  status: 'matched',
  checksum: 'sha256:hbr-0904-8435',
  date: '2026-09-04',
  amount: -84.35,
  description: 'HARBOUR GROCER WHARF ST',
  dialectAccountLabel: 'Everyday',
  rawRow: '04/09/2026,"HARBOUR GROCER WHARF ST",-84.35',
  entity: { matchType: 'alias', entityName: 'Harbour Grocer' },
};

export const IMPORT_PROGRESS: NonNullable<ImportsGetImportProgressResponses[200]> = {
  sessionId: 'session-everyday-sep',
  status: 'completed',
  currentStep: 'categorizing',
  startedAt: '2026-09-05T08:00:05.000Z',
  totalTransactions: 2,
  processedCount: 2,
  currentBatch: [],
  errors: [],
  result: { matched: [MATCHED_ROW], uncertain: [], failed: [], skipped: [SKIPPED_ROW] },
};
