import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elementAt } from '../../../test-utils';
import { useSuggestedTagRecompute } from '../hooks/useSuggestedTagRecompute';
import { moveOneToMatched, useReviewActions, type LocalTxState } from './useReviewActions';

import type { ProcessedTransaction } from '../../../store/importStore';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const { mockSuggestTags } = vi.hoisted(() => ({ mockSuggestTags: vi.fn() }));
vi.mock('../../../finance-api/index.js', () => ({
  transactionsSuggestTags: (...args: unknown[]) => mockSuggestTags(...args),
}));

function makeProcessed(
  checksum: string,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: `TXN ${checksum}`,
    amount: -44.63,
    account: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
    entity: { matchType: 'none' },
    status: 'uncertain',
    ...overrides,
  };
}

function emptyState(overrides: Partial<LocalTxState> = {}): LocalTxState {
  return { matched: [], uncertain: [], failed: [], skipped: [], ...overrides };
}

describe('moveOneToMatched', () => {
  it('replaces an already-matched transaction in place instead of appending a duplicate', () => {
    const target = makeProcessed('bunnings', {
      description: 'BUNNINGS WAREHOUSE KING KINGSGROVE',
      status: 'matched',
      entity: { matchType: 'learned' },
    });
    const other = makeProcessed('maccas', { status: 'matched', entity: { matchType: 'ai' } });
    const prev = emptyState({ matched: [other, target] });

    const next = moveOneToMatched(prev, {
      transaction: target,
      entityId: 'ent-bunnings',
      entityName: 'Bunnings Warehouse',
      matchType: 'manual',
    });

    // No duplicate: the matched bucket keeps the same length.
    expect(next.matched).toHaveLength(2);
    // Only one card carries the target checksum after the update.
    expect(next.matched.filter((t) => t.checksum === 'bunnings')).toHaveLength(1);
    // Position is preserved (target stays at index 1, behind `other`).
    expect(next.matched[1]?.checksum).toBe('bunnings');
    // The picked entity actually lands on the transaction.
    expect(next.matched[1]?.entity).toEqual({
      entityId: 'ent-bunnings',
      entityName: 'Bunnings Warehouse',
      matchType: 'manual',
      confidence: 1,
    });
    // Untouched sibling is left exactly as-is.
    expect(next.matched[0]).toBe(other);
  });

  it('appends when the transaction is not already matched, removing it from uncertain', () => {
    const target = makeProcessed('unknown-1', { status: 'uncertain' });
    const prev = emptyState({ uncertain: [target] });

    const next = moveOneToMatched(prev, {
      transaction: target,
      entityId: 'ent-x',
      entityName: 'X Corp',
      matchType: 'manual',
    });

    expect(next.uncertain).toHaveLength(0);
    expect(next.matched).toHaveLength(1);
    expect(next.matched[0]?.checksum).toBe('unknown-1');
    expect(next.matched[0]?.status).toBe('matched');
  });

  it('removes the transaction from the failed bucket when promoting it', () => {
    const target = makeProcessed('failed-1', { status: 'failed' });
    const prev = emptyState({ failed: [target] });

    const next = moveOneToMatched(prev, {
      transaction: target,
      entityId: 'ent-y',
      entityName: 'Y Ltd',
      matchType: 'manual',
    });

    expect(next.failed).toHaveLength(0);
    expect(next.matched.map((t) => t.checksum)).toEqual(['failed-1']);
  });

  it('never mutates the skipped bucket and leaves unrelated buckets referentially intact', () => {
    const skipped = makeProcessed('skip-1', { status: 'skipped' });
    const target = makeProcessed('unknown-2', { status: 'uncertain' });
    const prev = emptyState({ uncertain: [target], skipped: [skipped] });

    const next = moveOneToMatched(prev, {
      transaction: target,
      entityId: 'ent-z',
      entityName: 'Z GmbH',
      matchType: 'manual',
    });

    expect(next.skipped).toBe(prev.skipped);
    expect(next.skipped).toEqual([skipped]);
  });

  it('collapses pre-existing duplicate matched entries down to a single copy at the first position', () => {
    const dupeA = makeProcessed('dupe', {
      status: 'matched',
      description: 'FIRST COPY',
      entity: { matchType: 'learned' },
    });
    const dupeB = makeProcessed('dupe', {
      status: 'matched',
      description: 'SECOND COPY',
      entity: { matchType: 'ai' },
    });
    const other = makeProcessed('other', { status: 'matched' });
    // Corrupted prior state: two entries share the same checksum.
    const prev = emptyState({ matched: [dupeA, other, dupeB] });

    const next = moveOneToMatched(prev, {
      transaction: dupeA,
      entityId: 'ent-dupe',
      entityName: 'Deduped Co',
      matchType: 'manual',
    });

    expect(next.matched.filter((t) => t.checksum === 'dupe')).toHaveLength(1);
    // Single survivor sits at the first duplicate's original index (0).
    expect(next.matched[0]?.checksum).toBe('dupe');
    expect(next.matched[0]?.entity.entityName).toBe('Deduped Co');
    // The unrelated matched row is preserved once, after the collapsed entry.
    expect(next.matched.map((t) => t.checksum)).toEqual(['dupe', 'other']);
  });

  it('re-selecting the same entity twice is idempotent — no growth on repeated picks', () => {
    const target = makeProcessed('dedupe', { status: 'matched', entity: { matchType: 'manual' } });
    const prev = emptyState({ matched: [target] });

    const args = {
      transaction: target,
      entityId: 'ent-a',
      entityName: 'A',
      matchType: 'manual' as const,
    };
    const once = moveOneToMatched(prev, args);
    const twice = moveOneToMatched(once, { ...args, transaction: once.matched[0] ?? target });

    expect(twice.matched).toHaveLength(1);
    expect(twice.matched[0]?.entity.entityId).toBe('ent-a');
  });
});

function setupActions(similar: ProcessedTransaction[] = []) {
  const setLocalTransactions = vi.fn();
  const generateProposal = vi.fn().mockResolvedValue(undefined);
  const findSimilar = vi.fn().mockReturnValue(similar);
  const recomputeForEntity = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useReviewActions({ setLocalTransactions, findSimilar, generateProposal, recomputeForEntity })
  );
  return { result, setLocalTransactions, generateProposal, findSimilar, recomputeForEntity };
}

/** Invoke the "Save & Learn" action the fallback toast offers. */
function invokeLearnAction(): void {
  const options = toastMock.info.mock.calls.at(-1)?.[1] as
    | { action?: { onClick: () => void } }
    | undefined;
  options?.action?.onClick();
}

describe('useReviewActions — correcting a wrong match offers a rule', () => {
  beforeEach(() => {
    toastMock.info.mockClear();
    toastMock.success.mockClear();
  });

  // The reported bug: an AI-matched row sits alone in `matched`, the user picks
  // the right merchant from the inline picker, and nothing offers to learn it —
  // so the next import repeats the same wrong match.
  it.each(['ai', 'learned', 'alias', 'exact', 'prefix', 'contains'] as const)(
    'proposes a rule when a lone %s-matched row is reassigned',
    (matchType) => {
      const { result, generateProposal } = setupActions();
      const transaction = makeProcessed('maccas', {
        description: 'MCLUU DARLINGHURST',
        status: 'matched',
        entity: { matchType, entityId: 'ent-mcd', entityName: "McDonald's", confidence: 0.85 },
      });

      act(() => {
        result.current.handleEntitySelect(transaction, 'ent-sauna', 'SaunaX');
      });

      expect(generateProposal).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'ent-sauna', entityName: 'SaunaX' })
      );
      expect(toastMock.info).not.toHaveBeenCalled();
    }
  );

  it('stays silent when the picked entity is the one already matched', () => {
    const { result, generateProposal, setLocalTransactions } = setupActions();
    const transaction = makeProcessed('maccas', {
      status: 'matched',
      entity: { matchType: 'ai', entityId: 'ent-mcd', entityName: "McDonald's" },
    });

    act(() => {
      result.current.handleEntitySelect(transaction, 'ent-mcd', "McDonald's");
    });

    expect(generateProposal).not.toHaveBeenCalled();
    expect(toastMock.info).not.toHaveBeenCalled();
    // The bucket move still runs: accepting an AI suggestion that already
    // resolved to an entity id lands here and has to leave `uncertain`.
    expect(setLocalTransactions).toHaveBeenCalledTimes(1);
  });

  it('promotes an uncertain row whose AI suggestion already carries the picked entity id', () => {
    const { result, setLocalTransactions } = setupActions();
    const transaction = makeProcessed('maccas', {
      status: 'uncertain',
      entity: { matchType: 'ai', entityId: 'ent-mcd', entityName: "McDonald's", confidence: 0.55 },
    });

    act(() => {
      result.current.handleEntitySelect(transaction, 'ent-mcd', "McDonald's");
    });

    const updater = elementAt(setLocalTransactions.mock.calls, 0)[0] as (
      p: LocalTxState
    ) => LocalTxState;
    const next = updater(emptyState({ uncertain: [transaction] }));
    expect(next.uncertain).toHaveLength(0);
    expect(next.matched).toHaveLength(1);
  });

  it('falls back to an explicit learn offer when assigning an unmatched row with no siblings', () => {
    const { result, generateProposal } = setupActions();
    const transaction = makeProcessed('unknown-1', { entity: { matchType: 'none' } });

    act(() => {
      result.current.handleEntitySelect(transaction, 'ent-x', 'X Corp');
    });

    expect(generateProposal).not.toHaveBeenCalled();
    expect(toastMock.info).toHaveBeenCalledTimes(1);

    act(() => {
      invokeLearnAction();
    });
    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'ent-x', entityName: 'X Corp' })
    );
  });

  it('proposes straight away for an unmatched row that has similar siblings', () => {
    const sibling = makeProcessed('sibling');
    const { result, generateProposal } = setupActions([sibling]);
    const transaction = makeProcessed('unknown-2', { entity: { matchType: 'none' } });

    act(() => {
      result.current.handleEntitySelect(transaction, 'ent-x', 'X Corp');
    });

    expect(generateProposal).toHaveBeenCalledTimes(1);
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it('reassigning a row the user already fixed by hand only offers, never forces', () => {
    const { result, generateProposal } = setupActions();
    const transaction = makeProcessed('manual-1', {
      status: 'matched',
      entity: { matchType: 'manual', entityId: 'ent-a', entityName: 'A' },
    });

    act(() => {
      result.current.handleEntitySelect(transaction, 'ent-b', 'B');
    });

    expect(generateProposal).not.toHaveBeenCalled();
    expect(toastMock.info).toHaveBeenCalledTimes(1);
  });

  it('carries the correction into the local buckets regardless of the learn route', () => {
    const { result, setLocalTransactions } = setupActions();
    const transaction = makeProcessed('maccas', {
      status: 'matched',
      entity: { matchType: 'ai', entityId: 'ent-mcd', entityName: "McDonald's" },
    });

    act(() => {
      result.current.handleEntitySelect(transaction, 'ent-sauna', 'SaunaX');
    });

    const updater = elementAt(setLocalTransactions.mock.calls, 0)[0] as (
      p: LocalTxState
    ) => LocalTxState;
    const next = updater(emptyState({ matched: [transaction] }));
    expect(next.matched[0]?.entity).toMatchObject({
      entityId: 'ent-sauna',
      entityName: 'SaunaX',
      matchType: 'manual',
    });
  });
});

/**
 * The real recompute hook wired to the real actions over real state, with only
 * the HTTP lookup faked — the merge only holds end to end if the assignment
 * actually triggers it.
 */
function renderReviewWithRecompute(initial: LocalTxState) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(
    () => {
      const [state, setLocalTransactions] = useState<LocalTxState>(initial);
      const { recomputeForEntity, isRecomputingTags } = useSuggestedTagRecompute({
        setLocalTransactions,
      });
      const actions = useReviewActions({
        setLocalTransactions,
        findSimilar: () => [],
        generateProposal: vi.fn().mockResolvedValue(undefined),
        recomputeForEntity,
      });
      return { state, actions, isRecomputingTags };
    },
    { wrapper }
  );
}

const suggestTagsOk = (tags: unknown) => ({ data: { tags }, error: undefined });

describe('useReviewActions — a hand-assigned entity re-derives its tags (POPS-2595)', () => {
  beforeEach(() => {
    mockSuggestTags.mockReset();
    toastMock.error.mockClear();
  });

  it('picks up the entity defaults the row could not have carried while unmatched', async () => {
    mockSuggestTags.mockResolvedValue(
      suggestTagsOk([
        { tag: 'wellness', source: 'entity' },
        { tag: 'recovery', source: 'rule', pattern: 'SAUNA' },
      ])
    );
    const transaction = makeProcessed('sauna', {
      description: 'SAUNAX BONDI',
      suggestedTags: [],
    });
    const { result } = renderReviewWithRecompute(emptyState({ uncertain: [transaction] }));

    act(() => {
      result.current.actions.handleEntitySelect(transaction, 'ent-sauna', 'SaunaX');
    });

    await waitFor(() => {
      expect(result.current.state.matched[0]?.suggestedTags?.length).toBeGreaterThan(0);
    });
    expect(mockSuggestTags).toHaveBeenCalledWith({
      query: { description: 'SAUNAX BONDI', entityId: 'ent-sauna' },
    });
    expect(result.current.state.matched[0]?.suggestedTags).toEqual([
      { tag: 'recovery', source: 'rule', pattern: 'SAUNA' },
      { tag: 'wellness', source: 'entity' },
    ]);
  });

  it('replaces the previous merchant defaults but keeps what the user typed', async () => {
    mockSuggestTags.mockResolvedValue(suggestTagsOk([{ tag: 'wellness', source: 'entity' }]));
    const transaction = makeProcessed('sauna', {
      description: 'SAUNAX BONDI',
      status: 'matched',
      entity: { entityId: 'ent-gym', entityName: 'Gym', matchType: 'ai', confidence: 0.6 },
      // `hand-typed` stands in for anything not derived from the old entity:
      // the AI pass is entity-independent and has to survive the recompute.
      suggestedTags: [
        { tag: 'hand-typed', source: 'ai' },
        { tag: 'fitness', source: 'entity' },
      ],
    });
    const { result } = renderReviewWithRecompute(emptyState({ matched: [transaction] }));

    act(() => {
      result.current.actions.handleEntitySelect(transaction, 'ent-sauna', 'SaunaX');
    });

    await waitFor(() => {
      expect(result.current.state.matched[0]?.suggestedTags).toEqual([
        { tag: 'hand-typed', source: 'ai' },
        { tag: 'wellness', source: 'entity' },
      ]);
    });
  });

  it('assigning a group issues one lookup per distinct description, not per row', async () => {
    mockSuggestTags.mockResolvedValue(suggestTagsOk([{ tag: 'wellness', source: 'entity' }]));
    const group = [
      makeProcessed('a', { description: 'SAUNAX BONDI', suggestedTags: [] }),
      makeProcessed('b', { description: 'SAUNAX BONDI', suggestedTags: [] }),
      makeProcessed('c', { description: 'SAUNAX SURRY HILLS', suggestedTags: [] }),
    ];
    const { result } = renderReviewWithRecompute(emptyState({ uncertain: group }));

    act(() => {
      result.current.actions.handleBulkEntitySelect(group, 'ent-sauna', 'SaunaX');
    });

    await waitFor(() => {
      expect(result.current.state.matched).toHaveLength(3);
      for (const tx of result.current.state.matched) {
        expect(tx.suggestedTags).toEqual([{ tag: 'wellness', source: 'entity' }]);
      }
    });
    expect(mockSuggestTags).toHaveBeenCalledTimes(2);
  });

  it('never looks up a locally-pending entity, but still sheds the old defaults', async () => {
    const transaction = makeProcessed('sauna', {
      status: 'matched',
      entity: { entityId: 'ent-gym', entityName: 'Gym', matchType: 'ai' },
      suggestedTags: [
        { tag: 'fitness', source: 'entity' },
        { tag: 'dining', source: 'ai' },
      ],
    });
    const { result } = renderReviewWithRecompute(emptyState({ matched: [transaction] }));

    act(() => {
      result.current.actions.handleEntitySelect(transaction, 'temp:entity:saunax', 'SaunaX');
    });

    await waitFor(() => {
      expect(result.current.state.matched[0]?.suggestedTags).toEqual([
        { tag: 'dining', source: 'ai' },
      ]);
    });
    expect(mockSuggestTags).not.toHaveBeenCalled();
  });

  it('keeps the existing suggestions and says so when the lookup fails', async () => {
    mockSuggestTags.mockRejectedValue(new Error('offline'));
    const transaction = makeProcessed('sauna', {
      suggestedTags: [{ tag: 'dining', source: 'ai' }],
    });
    const { result } = renderReviewWithRecompute(emptyState({ uncertain: [transaction] }));

    act(() => {
      result.current.actions.handleEntitySelect(transaction, 'ent-sauna', 'SaunaX');
    });

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledTimes(1);
    });
    expect(result.current.state.matched[0]?.suggestedTags).toEqual([
      { tag: 'dining', source: 'ai' },
    ]);
  });

  it('reports the recompute as in flight so Review cannot be left mid-lookup', async () => {
    let release: (() => void) | undefined;
    mockSuggestTags.mockImplementation(
      async () =>
        new Promise((resolve) => {
          release = () => resolve(suggestTagsOk([{ tag: 'wellness', source: 'entity' }]));
        })
    );
    const transaction = makeProcessed('sauna', { suggestedTags: [] });
    const { result } = renderReviewWithRecompute(emptyState({ uncertain: [transaction] }));

    act(() => {
      result.current.actions.handleEntitySelect(transaction, 'ent-sauna', 'SaunaX');
    });

    await waitFor(() => {
      expect(result.current.isRecomputingTags).toBe(true);
    });

    await act(async () => {
      release?.();
    });
    await waitFor(() => {
      expect(result.current.isRecomputingTags).toBe(false);
    });
  });
});
