import { useLayoutEffect, useMemo } from 'react';

import { SourceSessionView } from './retained-session-store';

import type { RetainedSourceOwner } from './retained-session-store';

/** Bind one committed view to its captured owner without sharing mount permissions with other views. */
export function useSessionView(owner: RetainedSourceOwner): SourceSessionView {
  const view = useMemo(() => new SourceSessionView(owner), [owner]);
  useLayoutEffect(() => {
    view.activate();
    return () => view.deactivate();
  }, [view]);
  return view;
}
