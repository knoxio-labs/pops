import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../finance-api/index.js', () => ({
  correctionsReviseChangeSet: vi.fn(),
  correctionsRejectProposal: vi.fn(),
}));

import { useApplyRejectMutations } from './useApplyRejectMutations';

import type { LocalOp } from '../correction-proposal-shared';
import type { UseApplyRejectMutationsOptions } from './applyRejectTypes';

const OP: LocalOp = {
  kind: 'add',
  clientId: 'add-1',
  data: { descriptionPattern: 'RICHARDSON', matchType: 'contains', tags: [] },
  dirty: false,
};

/**
 * A live Up import: rows staged by the webhook or the sync, so there is no
 * process session anywhere in these options — the shape POPS-3358 could not
 * apply in.
 */
function liveDraftOptions(
  overrides: Partial<UseApplyRejectMutationsOptions> = {}
): UseApplyRejectMutationsOptions {
  return {
    signal: null,
    localOps: [OP],
    combinedPreview: null,
    combinedPreviewError: null,
    previewTransactions: [],
    isFetching: false,
    previewMutationPending: false,
    hasDirty: false,
    onClose: () => {},
    setLocalOps: () => {},
    setSelectedClientId: () => {},
    setRationale: () => {},
    lastCombinedStructuralSigRef: { current: null },
    selectedOpPreviewKeyRef: { current: null },
    ...overrides,
  };
}

function renderCanApply(overrides: Partial<UseApplyRejectMutationsOptions> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useApplyRejectMutations(liveDraftOptions(overrides)), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useApplyRejectMutations — canApply in a live import (POPS-3358)', () => {
  // The regression itself. Reintroducing a session gate in the hook — however
  // it is spelled, including `deriveCanApply(...) && Boolean(sessionId)` —
  // fails here, which a test of the pure derivation cannot do: its input has
  // no session field to withhold.
  it('allows applying with no process session anywhere in its options', () => {
    const { result } = renderCanApply();
    expect(result.current.canApply).toBe(true);
  });

  it('still refuses with nothing to apply', () => {
    const { result } = renderCanApply({ localOps: [] });
    expect(result.current.canApply).toBe(false);
  });

  it('still refuses while an edit is unpreviewed', () => {
    const { result } = renderCanApply({ hasDirty: true });
    expect(result.current.canApply).toBe(false);
  });

  it('still refuses when the preview failed', () => {
    const { result } = renderCanApply({ combinedPreviewError: 'boom' });
    expect(result.current.canApply).toBe(false);
  });

  it('still refuses while the editor is busy', () => {
    const { result } = renderCanApply({ isFetching: true });
    expect(result.current.canApply).toBe(false);
  });
});
