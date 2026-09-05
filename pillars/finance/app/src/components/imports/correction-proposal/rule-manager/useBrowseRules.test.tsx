/**
 * The browse window is capped, and the server orders the merged rule set by
 * confidence — so the rules on screen are a cross-section of priority order,
 * not a prefix. Renumbering that cross-section to 10, 20, 30 … rewrites the
 * matcher's ordering for every rule outside the window (POPS-2696). These tests
 * pin which of the two reorder strategies the hook picks, and on what evidence.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../../store/importStore';
import { useBrowseRules } from './useBrowseRules';

import type { LocalOp } from '../../correction-proposal-shared';
import type { CorrectionRule } from '../../RulePicker';

const mockListMerged = vi.fn();
const mockToastError = vi.fn();

vi.mock('../../../../finance-api/index.js', () => ({
  correctionsListMerged: (...args: unknown[]) => mockListMerged(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: (msg: string) => mockToastError(msg), success: vi.fn(), info: vi.fn() },
}));

function rule(id: string, priority: number): CorrectionRule {
  return {
    id,
    descriptionPattern: id.toUpperCase(),
    accountId: null,
    matchType: 'exact',
    entityId: null,
    entityName: null,
    location: null,
    tags: [],
    transactionType: null,
    isActive: true,
    priority,
    confidence: 0.9,
    timesApplied: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
  };
}

const SHOWN = [rule('a', 100), rule('b', 200), rule('c', 300)];

function listResolves(total: number) {
  mockListMerged.mockResolvedValue({
    data: {
      data: SHOWN,
      pagination: { total, limit: 500, offset: 0 },
    },
    error: undefined,
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

/** Drive the hook and capture what it pushes through `setLocalOps`. */
function renderBrowse() {
  let ops: LocalOp[] = [];
  const setLocalOps = vi.fn((updater: React.SetStateAction<LocalOp[]>) => {
    ops = typeof updater === 'function' ? updater(ops) : updater;
  });
  const view = renderHook(
    () => useBrowseRules({ open: true, localOps: ops, browseSearch: '', setLocalOps }),
    { wrapper }
  );
  return { ...view, readOps: () => ops };
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
});

describe('useBrowseRules — reordering a window that may be partial', () => {
  it('renumbers the whole list when the window holds every rule', async () => {
    listResolves(SHOWN.length);
    const { result, readOps } = renderBrowse();
    await waitFor(() => expect(result.current.browseWindowComplete).toBe(true));

    const c = SHOWN[2];
    const a = SHOWN[0];
    const b = SHOWN[1];
    if (!a || !b || !c) throw new Error('fixture');
    result.current.handleBrowseReorderFullList([c, a, b], 'c');

    const priorities = readOps().map((o) => (o.kind === 'edit' ? o.data.priority : null));
    expect(priorities).toEqual([10, 20, 30]);
  });

  it('moves the dragged rule alone when rules exist outside the window', async () => {
    listResolves(900);
    const { result, readOps } = renderBrowse();
    await waitFor(() => expect(result.current.browseWindowComplete).toBe(false));

    const a = SHOWN[0];
    const b = SHOWN[1];
    const c = SHOWN[2];
    if (!a || !b || !c) throw new Error('fixture');
    result.current.handleBrowseReorderFullList([a, c, b], 'c');

    const ops = readOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.kind === 'edit' && ops[0].targetRuleId).toBe('c');
    expect(ops[0]?.kind === 'edit' && ops[0].data.priority).toBe(150);
  });

  it('reports the true total, not the size of the window', async () => {
    listResolves(900);
    const { result } = renderBrowse();

    await waitFor(() => expect(result.current.browseTotal).toBe(900));
    expect(result.current.browseMergedRules).toHaveLength(3);
  });

  it('refuses a move it cannot place, rather than renumbering to make room', async () => {
    mockListMerged.mockResolvedValue({
      data: {
        data: [rule('x', 10), rule('z', 40), rule('y', 11)],
        pagination: { total: 900, limit: 500, offset: 0 },
      },
      error: undefined,
    });
    const { result, readOps } = renderBrowse();
    await waitFor(() => expect(result.current.browseWindowComplete).toBe(false));

    result.current.handleBrowseReorderFullList([rule('x', 10), rule('z', 40), rule('y', 11)], 'z');

    expect(readOps()).toHaveLength(0);
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('Could not reorder'));
  });
});
