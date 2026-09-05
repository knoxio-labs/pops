import { beforeEach, describe, expect, it } from 'vitest';

import {
  clampResumeStep,
  hasResumableImport,
  partializeImportState,
  type PersistedImportState,
} from './import-store-persistence';
import { useImportStore } from './importStore';

import type { CommitResult, ParsedTransaction } from '@pops/finance';

import type { ProcessedTransaction } from './import-store-types';

const PERSISTED_KEYS = [
  'currentStep',
  'sourceFileNames',
  'accountId',
  'accountName',
  'dialectId',
  'headers',
  'rows',
  'columnMap',
  'parsedTransactions',
  'parsedTransactionsFingerprint',
  'processSessionId',
  'processedForFingerprint',
  'processedTransactions',
  'confirmedTransactions',
  'commitResult',
  'pendingEntities',
  'pendingChangeSets',
  'pendingTagRuleChangeSets',
  'manuallyResolvedChecksums',
];

function makeParsed(checksum: string): ParsedTransaction {
  return {
    date: '2026-01-15',
    description: `TXN ${checksum}`,
    amount: -10,
    account: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

function makeProcessed(checksum: string): ProcessedTransaction {
  return { ...makeParsed(checksum), entity: { matchType: 'none' }, status: 'uncertain' };
}

function makeCommitResult(): CommitResult {
  return {
    entitiesCreated: 1,
    rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
    tagRulesApplied: 0,
    transactionsImported: 1,
    transactionsFailed: 0,
    failedDetails: [],
    retroactiveReclassifications: 0,
    checkpoints: [],
  };
}

function makePersisted(overrides: Partial<PersistedImportState> = {}): PersistedImportState {
  return { ...partializeImportState(useImportStore.getState()), ...overrides };
}

beforeEach(() => {
  useImportStore.getState().reset();
});

describe('partializeImportState', () => {
  it('persists exactly the nineteen data fields — never files, never actions', () => {
    const persisted = partializeImportState(useImportStore.getState());
    expect(Object.keys(persisted).toSorted()).toEqual([...PERSISTED_KEYS].toSorted());
    expect(Object.values(persisted).some((entry) => typeof entry === 'function')).toBe(false);
  });
});

describe('hasResumableImport', () => {
  it('is false for the initial state', () => {
    expect(hasResumableImport(useImportStore.getState())).toBe(false);
  });

  it('is false on step 1 even with rows', () => {
    expect(hasResumableImport(makePersisted({ currentStep: 1, rows: [{ A: '1' }] }))).toBe(false);
  });

  it('is false once committed', () => {
    expect(
      hasResumableImport(
        makePersisted({ currentStep: 8, rows: [{ A: '1' }], commitResult: makeCommitResult() })
      )
    ).toBe(false);
  });

  it('is false past step 1 without rows', () => {
    expect(hasResumableImport(makePersisted({ currentStep: 3 }))).toBe(false);
  });

  it('is true for an uncommitted run parked at step 2 with parsed CSV rows', () => {
    expect(hasResumableImport(makePersisted({ currentStep: 2, rows: [{ A: '1' }] }))).toBe(true);
  });

  it('is true deep in the wizard while uncommitted', () => {
    expect(hasResumableImport(makePersisted({ currentStep: 7, rows: [{ A: '1' }] }))).toBe(true);
  });
});

describe('clampResumeStep', () => {
  const rows = [{ A: '1' }];
  const headers = ['A'];

  it('demotes step 7 without confirmed transactions to 4 when processed results are current', () => {
    const state = makePersisted({
      currentStep: 7,
      rows,
      headers,
      parsedTransactions: [makeParsed('a')],
      parsedTransactionsFingerprint: 'a',
      processedForFingerprint: 'a',
      processedTransactions: {
        matched: [makeProcessed('a')],
        uncertain: [],
        failed: [],
        skipped: [],
      },
    });
    expect(clampResumeStep(state)).toBe(4);
  });

  it('demotes step 6 without processed results to 3', () => {
    const state = makePersisted({
      currentStep: 6,
      rows,
      headers,
      parsedTransactions: [makeParsed('a')],
      parsedTransactionsFingerprint: 'a',
    });
    expect(clampResumeStep(state)).toBe(3);
  });

  it('treats a fingerprint mismatch as not-processed and demotes to 3', () => {
    const state = makePersisted({
      currentStep: 5,
      rows,
      headers,
      parsedTransactions: [makeParsed('new')],
      parsedTransactionsFingerprint: 'new',
      processedForFingerprint: 'old',
      processedTransactions: {
        matched: [makeProcessed('old')],
        uncertain: [],
        failed: [],
        skipped: [],
      },
    });
    expect(clampResumeStep(state)).toBe(3);
  });

  it('demotes step 8 without a commit result to 7 when transactions are confirmed', () => {
    const state = makePersisted({
      currentStep: 8,
      rows,
      headers,
      parsedTransactions: [makeParsed('a')],
      parsedTransactionsFingerprint: 'a',
      confirmedTransactions: [makeParsed('a')],
    });
    expect(clampResumeStep(state)).toBe(7);
  });

  it('keeps step 2 when rows and headers exist', () => {
    expect(clampResumeStep(makePersisted({ currentStep: 2, rows, headers }))).toBe(2);
  });

  it('falls back to step 1 when nothing downstream is satisfied', () => {
    expect(clampResumeStep(makePersisted({ currentStep: 4 }))).toBe(1);
  });

  it('never promotes: a lower currentStep wins over a higher cap', () => {
    const state = makePersisted({
      currentStep: 2,
      rows,
      headers,
      parsedTransactions: [makeParsed('a')],
      parsedTransactionsFingerprint: 'a',
    });
    expect(clampResumeStep(state)).toBe(2);
  });

  it('keeps a legitimately deep step when its prerequisites hold', () => {
    const state = makePersisted({
      currentStep: 5,
      rows,
      headers,
      parsedTransactions: [makeParsed('a')],
      parsedTransactionsFingerprint: 'a',
      confirmedTransactions: [makeParsed('a')],
    });
    expect(clampResumeStep(state)).toBe(5);
  });
});
