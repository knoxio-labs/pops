import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  clearPersistedImport,
  subscribeImportCleared,
} from '../../../store/import-store-lifecycle';
import { clampResumeStep, hasResumableImport } from '../../../store/import-store-persistence';
import { useImportStore } from '../../../store/importStore';

export type ResumeStatus = 'pending' | 'prompt' | 'ready';

function useHydrationGate(setStatus: (status: ResumeStatus) => void): void {
  useEffect(() => {
    // Same-session SPA navigation away/back: the live in-memory state wins.
    // The persisted copy is debounce-stale by definition, so never rehydrate
    // over it and never prompt.
    if (hasResumableImport(useImportStore.getState())) {
      setStatus('ready');
      return;
    }
    let cancelled = false;
    const hydrate = async () => {
      try {
        await useImportStore.persist.rehydrate();
      } catch {
        useImportStore.getState().reset();
      }
      if (cancelled) return;
      const state = useImportStore.getState();
      if (hasResumableImport(state)) {
        state.goToStep(clampResumeStep(state));
        setStatus('prompt');
      } else {
        state.reset();
        clearPersistedImport(false);
        setStatus('ready');
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [setStatus]);
}

/**
 * Gates the import wizard behind async rehydration of the persisted wizard
 * copy. Cross-session mounts (refresh, new tab) rehydrate from IndexedDB and
 * offer Resume/Discard with the resume step clamped to satisfied
 * prerequisites; same-session navigation keeps live in-memory state untouched.
 * A clear broadcast from another tab resets a still-resumable wizard here.
 */
export function useImportResume(): {
  status: ResumeStatus;
  /** True once the person chose Resume: the wizard holds a run already in progress. */
  resumed: boolean;
  resume: () => void;
  discard: () => void;
} {
  const [status, setStatus] = useState<ResumeStatus>('pending');
  const [resumed, setResumed] = useState(false);
  const { t } = useTranslation('finance');

  useHydrationGate(setStatus);

  useEffect(
    () =>
      subscribeImportCleared(() => {
        if (!hasResumableImport(useImportStore.getState())) return;
        useImportStore.getState().reset();
        setStatus('ready');
        toast.info(t('import.resumeClearedElsewhere'));
      }),
    [t]
  );

  const resume = useCallback(() => {
    setResumed(true);
    setStatus('ready');
  }, []);
  const discard = useCallback(() => {
    useImportStore.getState().reset();
    clearPersistedImport(true);
    setStatus('ready');
  }, []);

  return { status, resumed, resume, discard };
}
