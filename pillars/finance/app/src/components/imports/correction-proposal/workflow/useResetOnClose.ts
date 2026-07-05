import { useCallback } from 'react';

import type { PreviewView } from '../../CorrectionProposalDialogPanels';
import type { LocalOp } from '../types';

interface ResetArgs {
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  setSelectedClientId: (v: string | null) => void;
  setPreviewView: (v: PreviewView) => void;
  resetPreviewState: () => void;
  resetMutationState: () => void;
  setRationale: (v: string | null) => void;
  seededForSignalRef: React.MutableRefObject<string | null>;
  onOpenChange: (v: boolean) => void;
}

export function useResetOnClose(args: ResetArgs) {
  const {
    onOpenChange,
    setLocalOps,
    setSelectedClientId,
    setPreviewView,
    resetPreviewState,
    resetMutationState,
    setRationale,
    seededForSignalRef,
  } = args;
  return useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (nextOpen) return;
      setLocalOps([]);
      setSelectedClientId(null);
      setPreviewView('selected');
      resetPreviewState();
      resetMutationState();
      setRationale(null);
      seededForSignalRef.current = null;
    },
    [
      onOpenChange,
      resetPreviewState,
      resetMutationState,
      seededForSignalRef,
      setLocalOps,
      setRationale,
      setSelectedClientId,
      setPreviewView,
    ]
  );
}
