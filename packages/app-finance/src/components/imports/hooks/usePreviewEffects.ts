/**
 * usePreviewEffects — manages combined and selected-op preview state.
 *
 * Extracted from CorrectionProposalDialog (tb-364).
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { trpc } from '@pops/api-client';

import {
  type PreviewSlotState,
  useCombinedEffect,
  useSelectedOpEffect,
} from './preview-effect-hooks';

import type {
  LocalOp,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';

export interface UsePreviewEffectsOptions {
  open: boolean;
  localOps: LocalOp[];
  selectedOp: LocalOp | null;
  minConfidence: number;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  /** Optional: existing DB transactions to include in browse-mode preview (PRD-032 US-06). */
  dbTransactions?: Array<{ checksum?: string | null; description: string }>;
  pendingChangeSets: Array<{ changeSet: ServerChangeSet }>;
}

export interface UsePreviewEffectsReturn {
  combinedPreview: PreviewChangeSetOutput | null;
  combinedPreviewError: string | null;
  combinedPreviewTruncated: boolean;
  combinedDbPreview: PreviewChangeSetOutput | null;
  selectedOpPreview: PreviewChangeSetOutput | null;
  selectedOpPreviewError: string | null;
  selectedOpPreviewTruncated: boolean;
  selectedOpDbPreview: PreviewChangeSetOutput | null;
  previewMutationPending: boolean;
  hasDirty: boolean;
  rerunToken: number;
  handleRerunPreview: () => void;
  resetPreviewState: () => void;
  lastCombinedStructuralSigRef: React.MutableRefObject<string | null>;
  selectedOpPreviewKeyRef: React.MutableRefObject<string | null>;
  clearDirtyFlags: () => void;
}

function useSlot(): PreviewSlotState {
  const [preview, setPreview] = useState<PreviewChangeSetOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [dbPreview, setDbPreview] = useState<PreviewChangeSetOutput | null>(null);
  return { preview, setPreview, error, setError, truncated, setTruncated, dbPreview, setDbPreview };
}

interface PreviewRefs {
  selectedOpPreviewKeyRef: React.MutableRefObject<string | null>;
  lastCombinedStructuralSigRef: React.MutableRefObject<string | null>;
  lastCombinedRerunToken: React.MutableRefObject<number>;
  lastSelectedRerunToken: React.MutableRefObject<number>;
}

function usePreviewRefs(): PreviewRefs {
  return {
    selectedOpPreviewKeyRef: useRef<string | null>(null),
    lastCombinedStructuralSigRef: useRef<string | null>(null),
    lastCombinedRerunToken: useRef<number>(0),
    lastSelectedRerunToken: useRef<number>(0),
  };
}

function buildResetState(
  combined: PreviewSlotState,
  selected: PreviewSlotState,
  refs: PreviewRefs,
  setRerunToken: (n: number) => void
) {
  return () => {
    combined.setPreview(null);
    combined.setError(null);
    combined.setTruncated(false);
    combined.setDbPreview(null);
    selected.setPreview(null);
    selected.setError(null);
    selected.setTruncated(false);
    selected.setDbPreview(null);
    refs.selectedOpPreviewKeyRef.current = null;
    refs.lastCombinedStructuralSigRef.current = null;
    refs.lastCombinedRerunToken.current = 0;
    refs.lastSelectedRerunToken.current = 0;
    setRerunToken(0);
  };
}

function buildReturnValue(
  combined: PreviewSlotState,
  selected: PreviewSlotState,
  refs: PreviewRefs,
  extras: {
    previewMutationPending: boolean;
    hasDirty: boolean;
    rerunToken: number;
    handleRerunPreview: () => void;
    resetPreviewState: () => void;
    clearDirtyFlags: () => void;
  }
): UsePreviewEffectsReturn {
  return {
    combinedPreview: combined.preview,
    combinedPreviewError: combined.error,
    combinedPreviewTruncated: combined.truncated,
    combinedDbPreview: combined.dbPreview,
    selectedOpPreview: selected.preview,
    selectedOpPreviewError: selected.error,
    selectedOpPreviewTruncated: selected.truncated,
    selectedOpDbPreview: selected.dbPreview,
    lastCombinedStructuralSigRef: refs.lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef: refs.selectedOpPreviewKeyRef,
    ...extras,
  };
}

export function usePreviewEffects(
  options: UsePreviewEffectsOptions,
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>
): UsePreviewEffectsReturn {
  const { localOps, dbTransactions } = options;
  const combined = useSlot();
  const selected = useSlot();
  const refs = usePreviewRefs();
  const [rerunToken, setRerunToken] = useState(0);
  const previewMutation = trpc.core.corrections.previewChangeSet.useMutation({ retry: false });

  const clearDirtyFlags = useCallback(
    () => setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o))),
    [setLocalOps]
  );

  const normalisedDbTransactions = useMemo(
    () =>
      (dbTransactions ?? []).map((t) => ({
        description: t.description,
        checksum: t.checksum ?? undefined,
      })),
    [dbTransactions]
  );

  useCombinedEffect({
    open: options.open,
    localOps: options.localOps,
    minConfidence: options.minConfidence,
    previewTransactions: options.previewTransactions,
    pendingChangeSets: options.pendingChangeSets,
    combined,
    setLocalOps,
    normalisedDbTransactions,
    rerunToken,
    previewMutateAsync: previewMutation.mutateAsync,
    lastSigRef: refs.lastCombinedStructuralSigRef,
    lastTokenRef: refs.lastCombinedRerunToken,
  });
  useSelectedOpEffect({
    open: options.open,
    selectedOp: options.selectedOp,
    minConfidence: options.minConfidence,
    previewTransactions: options.previewTransactions,
    pendingChangeSets: options.pendingChangeSets,
    selected,
    normalisedDbTransactions,
    rerunToken,
    previewMutateAsync: previewMutation.mutateAsync,
    selectedOpPreviewKeyRef: refs.selectedOpPreviewKeyRef,
    lastTokenRef: refs.lastSelectedRerunToken,
  });

  const handleRerunPreview = useCallback(() => setRerunToken((t) => t + 1), []);
  const resetPreviewState = useCallback(buildResetState(combined, selected, refs, setRerunToken), [
    combined,
    selected,
    refs,
  ]);
  const hasDirty = useMemo(() => localOps.some((o) => o.dirty), [localOps]);

  return buildReturnValue(combined, selected, refs, {
    previewMutationPending: previewMutation.isPending,
    hasDirty,
    rerunToken,
    handleRerunPreview,
    resetPreviewState,
    clearDirtyFlags,
  });
}
