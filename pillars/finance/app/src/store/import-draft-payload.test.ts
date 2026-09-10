import { describe, expect, it } from 'vitest';

import {
  clampResumeStep,
  draftCountsOf,
  draftPayloadChanged,
  hasDraftWorthyState,
  isDraftPayload,
  toDraftPayload,
} from './import-draft-payload';
import { initialState } from './import-store-types';
import { useImportStore } from './importStore';

import type { ParsedTransaction, ProcessedTransaction } from '@pops/finance';

function parsed(checksum: string, date: string): ParsedTransaction {
  return {
    date,
    description: `ROW ${checksum}`,
    amount: -10,
    dialectAccountLabel: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

function processed(
  checksum: string,
  status: 'matched' | 'uncertain' | 'failed'
): ProcessedTransaction {
  return { ...parsed(checksum, '2026-02-13'), status, entity: { matchType: 'none' } };
}

const emptyProcessed = {
  matched: [],
  uncertain: [],
  failed: [],
  skipped: [],
  warnings: undefined,
};

function base() {
  useImportStore.setState({ ...initialState });
  return toDraftPayload(useImportStore.getState());
}

describe('toDraftPayload', () => {
  it('keeps every persisted field and nothing else', () => {
    useImportStore.setState({ ...initialState, files: [new File(['x'], 'x.csv')], draftId: 'd1' });
    const payload = toDraftPayload(useImportStore.getState());
    expect(Object.keys(payload).toSorted()).toEqual(
      [
        'accountId',
        'accountName',
        'columnMap',
        'commitResult',
        'confirmedTransactions',
        'currentStep',
        'dialectId',
        'headers',
        'manuallyResolvedChecksums',
        'parsedTransactions',
        'parsedTransactionsFingerprint',
        'pendingChangeSets',
        'pendingEntities',
        'pendingTagRuleChangeSets',
        'processSessionId',
        'processedForFingerprint',
        'processedTransactions',
        'rows',
        'sourceFileNames',
      ].toSorted()
    );
    expect(isDraftPayload({ ...payload })).toBe(true);
  });
});

describe('isDraftPayload', () => {
  it.each([
    ['currentStep', 'four'],
    ['accountId', 7],
    ['rows', 'not-an-array'],
    ['columnMap', null],
    ['processedTransactions', { matched: [] }],
    ['pendingChangeSets', undefined],
  ])('rejects a payload whose %s is malformed', (key, value) => {
    expect(isDraftPayload({ ...base(), [key]: value })).toBe(false);
  });

  it('rejects an empty record', () => {
    expect(isDraftPayload({})).toBe(false);
  });
});

describe('draftPayloadChanged', () => {
  it('is false for a change to a field the draft does not hold', () => {
    base();
    const before = useImportStore.getState();
    before.setDraftId('abc');
    expect(draftPayloadChanged(useImportStore.getState(), before)).toBe(false);
  });

  it('is true for a change to any held field', () => {
    base();
    const before = useImportStore.getState();
    before.nextStep();
    expect(draftPayloadChanged(useImportStore.getState(), before)).toBe(true);
  });
});

describe('draftCountsOf', () => {
  it('counts rows from parsed transactions, falling back to raw rows, and spans the dates', () => {
    const payload = { ...base(), rows: [{ a: '1' }, { a: '2' }, { a: '3' }] };
    expect(draftCountsOf(payload)).toMatchObject({ rowCount: 3, span: null, step: 1 });

    const withParsed = {
      ...payload,
      currentStep: 4,
      processSessionId: 'sess',
      parsedTransactions: [parsed('b', '2026-02-20'), parsed('a', '2026-02-01')],
    };
    expect(draftCountsOf(withParsed)).toEqual({
      step: 4,
      rowCount: 2,
      unresolvedCount: 0,
      span: { from: '2026-02-01', to: '2026-02-20' },
      processSessionId: 'sess',
    });
  });

  it('counts uncertain and failed rows the person has not resolved by hand', () => {
    const payload = {
      ...base(),
      processedTransactions: {
        ...emptyProcessed,
        matched: [processed('m', 'matched')],
        uncertain: [processed('u1', 'uncertain'), processed('u2', 'uncertain')],
        failed: [processed('f1', 'failed')],
      },
      manuallyResolvedChecksums: ['u2'],
    };
    expect(draftCountsOf(payload).unresolvedCount).toBe(2);
  });
});

describe('hasDraftWorthyState', () => {
  it('needs an account and rows, and stops once committed', () => {
    useImportStore.setState({ ...initialState });
    expect(hasDraftWorthyState(useImportStore.getState())).toBe(false);
    useImportStore.setState({ rows: [{ a: '1' }] });
    expect(hasDraftWorthyState(useImportStore.getState())).toBe(false);
    useImportStore.setState({ accountId: 'acc' });
    expect(hasDraftWorthyState(useImportStore.getState())).toBe(true);
    useImportStore.setState({
      commitResult: {
        entitiesCreated: 0,
        rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
        tagRulesApplied: 0,
        transactionsImported: 1,
        transactionsFailed: 0,
        failedDetails: [],
        retroactiveReclassifications: 0,
      },
    });
    expect(hasDraftWorthyState(useImportStore.getState())).toBe(false);
  });
});

describe('clampResumeStep', () => {
  it('caps at the last step the payload can stand on', () => {
    const b = base();
    expect(clampResumeStep({ ...b, currentStep: 6 })).toBe(1);
    expect(clampResumeStep({ ...b, currentStep: 6, rows: [{ a: '1' }], headers: ['a'] })).toBe(2);
    expect(
      clampResumeStep({ ...b, currentStep: 6, parsedTransactions: [parsed('a', '2026-02-01')] })
    ).toBe(3);
    expect(
      clampResumeStep({
        ...b,
        currentStep: 6,
        parsedTransactions: [parsed('a', '2026-02-01')],
        parsedTransactionsFingerprint: 'fp',
        processedForFingerprint: 'fp',
        processedTransactions: { ...emptyProcessed, matched: [processed('a', 'matched')] },
      })
    ).toBe(4);
    expect(
      clampResumeStep({
        ...b,
        currentStep: 7,
        confirmedTransactions: [parsed('a', '2026-02-01')],
      })
    ).toBe(7);
  });

  it('never raises the step, only lowers it', () => {
    expect(
      clampResumeStep({
        ...base(),
        currentStep: 2,
        confirmedTransactions: [parsed('a', '2026-02-01')],
      })
    ).toBe(2);
  });

  it('treats stale processed results as none', () => {
    expect(
      clampResumeStep({
        ...base(),
        currentStep: 5,
        parsedTransactions: [parsed('a', '2026-02-01')],
        parsedTransactionsFingerprint: 'new',
        processedForFingerprint: 'old',
        processedTransactions: { ...emptyProcessed, matched: [processed('a', 'matched')] },
      })
    ).toBe(3);
  });
});
