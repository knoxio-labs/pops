import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTransactionEditing } from './useTransactionEditing';

import type { ProcessedTransaction } from '../../../store/importStore';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

function makeTransaction(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: 'WOOLWORTHS 1234',
    amount: -12.34,
    account: 'Everyday',
    rawRow: '{}',
    checksum: 'abc',
    entity: { matchType: 'learned', confidence: 0.92, entityId: 'ent-1', entityName: 'Woolworths' },
    status: 'matched',
    ruleProvenance: {
      source: 'correction',
      ruleId: 'corr-1',
      pattern: 'WOOLWORTHS',
      matchType: 'contains',
      confidence: 0.92,
    },
    ...overrides,
  };
}

function emptyLocalTx() {
  return { matched: [], uncertain: [], failed: [], skipped: [] };
}

function setup() {
  const setLocalTransactions = vi.fn();
  const generateProposal = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useTransactionEditing({ setLocalTransactions, generateProposal })
  );
  return { result, setLocalTransactions, generateProposal };
}

describe('useTransactionEditing — rule-matched inline edits', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.info.mockClear();
  });

  it('does not redirect a no-op save on a rule-matched, entity-carrying row into a correction proposal', () => {
    // Regression: editedFields never seeded `entity`, so
    // `editedFields.entity?.entityId !== transaction.entity?.entityId` was
    // always true for any row with an entity already assigned — even when the
    // user changed nothing and just clicked Save. That routed every save on a
    // rule-matched row into generateProposal(), which drops the description/
    // amount/date fields entirely (see buildLearnArgs).
    const { result, setLocalTransactions, generateProposal } = setup();
    const transaction = makeTransaction();

    act(() => {
      result.current.handleSaveEdit(transaction, {
        description: transaction.description,
        amount: transaction.amount,
        entity: transaction.entity,
      });
    });

    expect(generateProposal).not.toHaveBeenCalled();
    expect(setLocalTransactions).toHaveBeenCalledTimes(1);
  });

  it('persists a description-only edit on an entity-matched row when the entity is unchanged', () => {
    const { result, setLocalTransactions, generateProposal } = setup();
    const transaction = makeTransaction({
      ruleProvenance: undefined,
      entity: { matchType: 'exact', entityId: 'ent-1', entityName: 'Woolworths' },
    });

    act(() => {
      result.current.handleSaveEdit(transaction, {
        description: 'WOOLWORTHS METRO',
        amount: transaction.amount,
        entity: transaction.entity,
      });
    });

    expect(generateProposal).not.toHaveBeenCalled();
    expect(setLocalTransactions).toHaveBeenCalledTimes(1);
    const updater = setLocalTransactions.mock.calls[0][0] as (
      prev: ReturnType<typeof emptyLocalTx>
    ) => ReturnType<typeof emptyLocalTx>;
    const next = updater({ ...emptyLocalTx(), matched: [transaction] });
    expect(next.matched[0]).toMatchObject({ description: 'WOOLWORTHS METRO' });
  });

  it('routes to the correction proposal only when the entity actually changes', () => {
    const { result, generateProposal, setLocalTransactions } = setup();
    const transaction = makeTransaction();

    act(() => {
      result.current.handleSaveEdit(transaction, {
        description: transaction.description,
        amount: transaction.amount,
        entity: { entityId: 'ent-2', entityName: 'Coles', matchType: 'manual' },
      });
    });

    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'ent-2', entityName: 'Coles' })
    );
    expect(setLocalTransactions).not.toHaveBeenCalled();
  });

  it('forces the edited transaction status to match its current bucket when a reconcile moved it', () => {
    // The `transaction` snapshot is captured at edit start with status
    // 'uncertain'. A server reconciliation between edit start and save moved
    // this checksum into the `failed` bucket. On save the edit must land in
    // `failed` carrying status 'failed', not the stale 'uncertain' — otherwise
    // the bucket/status invariant breaks and downstream UI/commit misbehaves.
    const { result, setLocalTransactions } = setup();
    const transaction = makeTransaction({
      ruleProvenance: undefined,
      status: 'uncertain',
      entity: { matchType: 'exact', entityId: 'ent-1', entityName: 'Woolworths' },
    });

    act(() => {
      result.current.handleSaveEdit(transaction, {
        description: 'WOOLWORTHS METRO',
        amount: transaction.amount,
        entity: transaction.entity,
      });
    });

    const updater = setLocalTransactions.mock.calls[0][0] as (
      prev: ReturnType<typeof emptyLocalTx>
    ) => ReturnType<typeof emptyLocalTx>;
    const next = updater({ ...emptyLocalTx(), failed: [{ ...transaction, status: 'failed' }] });

    expect(next.uncertain).toHaveLength(0);
    expect(next.failed).toHaveLength(1);
    expect(next.failed[0]).toMatchObject({ description: 'WOOLWORTHS METRO', status: 'failed' });
  });

  it('does not flag a change when editedFields omits a field entirely', () => {
    const { result, generateProposal, setLocalTransactions } = setup();
    const transaction = makeTransaction();

    act(() => {
      result.current.handleSaveEdit(transaction, {});
    });

    expect(generateProposal).not.toHaveBeenCalled();
    expect(setLocalTransactions).toHaveBeenCalledTimes(1);
  });
});

describe('useTransactionEditing — entity-optional bucket routing (#3757 nit 4)', () => {
  function runEdit(transactionType: string) {
    const { result, setLocalTransactions } = setup();
    const transaction = makeTransaction({
      ruleProvenance: undefined,
      entity: undefined,
      status: 'uncertain',
    });

    act(() => {
      result.current.handleSaveEdit(transaction, {
        transactionType: transactionType as ProcessedTransaction['transactionType'],
      });
    });

    const updater = setLocalTransactions.mock.calls[0][0] as (
      prev: ReturnType<typeof emptyLocalTx>
    ) => ReturnType<typeof emptyLocalTx>;
    return updater({ ...emptyLocalTx(), uncertain: [transaction] });
  }

  // Regression for the stale `transfer||income` hardcode: reclassifying an
  // uncertain card to an entity-optional type used to strand it in `uncertain`,
  // where the confirm step never reads it — silently dropping the edit.
  it.each(['loan', 'rebate', 'tax', 'reversal'])(
    'force-routes an uncertain card reclassified to %s into matched',
    (type) => {
      const next = runEdit(type);
      expect(next.uncertain).toHaveLength(0);
      expect(next.matched).toHaveLength(1);
      expect(next.matched[0]).toMatchObject({ transactionType: type, status: 'matched' });
    }
  );

  it('leaves an entity-required reclassification (purchase) in its current bucket', () => {
    const next = runEdit('purchase');
    expect(next.matched).toHaveLength(0);
    expect(next.uncertain).toHaveLength(1);
    expect(next.uncertain[0]).toMatchObject({ transactionType: 'purchase', status: 'uncertain' });
  });
});
