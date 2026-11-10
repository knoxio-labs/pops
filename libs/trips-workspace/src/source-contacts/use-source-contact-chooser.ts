import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { ContactChooserSelection } from '@pops/pillar-sdk';

import type { SourceContactAttempt, SourceContactSession } from './session';

/** Visible owner intent with guarded transitions; the retained session owns unresolved outcomes. */
export interface SourceContactChooserState {
  attempt: SourceContactAttempt | undefined;
  open: boolean;
  changeOpen: (open: boolean) => void;
  start: () => void;
  selectOwner: (selection: ContactChooserSelection) => void;
}

/** Guard one visible owner intent while retaining its evidence independently of the source write. */
export function useSourceContactChooser(
  session: SourceContactSession,
  intentKey: string,
  disabled: boolean,
  select: (uri: string) => void
): SourceContactChooserState {
  const [attempt, setAttempt] = useState<SourceContactAttempt>();
  const [open, setOpen] = useState(false);
  useSyncExternalStore(session.subscribe, session.snapshot);
  const mounted = useRef(false);
  const isOpen = useRef(false);
  const current = useRef({ disabled, select });
  useLayoutEffect(() => {
    current.current = { disabled, select };
  }, [disabled, select]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function changeOpen(next: boolean): void {
    isOpen.current = next;
    setOpen(next);
  }
  function start(): void {
    if (!session.isCurrent()) return;
    setAttempt(session.open(intentKey));
    changeOpen(true);
  }
  function selectOwner(selection: ContactChooserSelection): void {
    if (!attempt || !session.accept(attempt, selection) || !mounted.current) return;
    if (!isOpen.current || current.current.disabled || !session.isCurrent()) return;
    changeOpen(false);
    current.current.select(selection.reference.uri);
  }
  return { attempt, open, changeOpen, start, selectOwner };
}
