import { useCallback, useMemo, useState } from 'react';

import { captureCard, moveCard } from './canvas-actions';

import type { CanvasState } from './canvas-model';

/** Share local graph mutations and drag previews across route and visit projections. */
export function useCanvasActions(
  state: CanvasState,
  change: (next: CanvasState) => void,
  showDetails: boolean
) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [hoverVisit, setHoverVisit] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const preview = useMemo(
    () => (previewOrder ? { ...state, order: previewOrder } : state),
    [state, previewOrder]
  );
  const actions = useMemo(
    () => ({
      state,
      preview,
      showDetails,
      change,
      dragged,
      setDragged,
      hoverVisit,
      setHoverVisit,
      previewOrder: setPreviewOrder,
      add: (
        kind: Parameters<typeof captureCard>[1],
        title: string,
        target: Parameters<typeof captureCard>[3]
      ) => change(captureCard(state, kind, title, target)),
      move: (id: string, target: Parameters<typeof moveCard>[2]) => {
        change(moveCard(state, id, target));
        setDragged(null);
        setHoverVisit(null);
        setPreviewOrder(null);
      },
    }),
    [state, preview, showDetails, change, dragged, hoverVisit]
  );
  return actions;
}

/** Keep a local snapshot history; undo restores the source graph across every projection. */
export function useRouteState(initial: () => CanvasState) {
  const [route, setRoute] = useState<{ state: CanvasState; history: CanvasState[] }>(() => ({
    state: initial(),
    history: [],
  }));
  const change = useCallback((next: CanvasState) => {
    setRoute((previous) =>
      next === previous.state
        ? previous
        : { state: next, history: [...previous.history, previous.state] }
    );
  }, []);
  const undo = useCallback(() => {
    setRoute((previous) => {
      const state = previous.history.at(-1);
      return state ? { state, history: previous.history.slice(0, -1) } : previous;
    });
  }, []);
  return { state: route.state, change, undo, canUndo: route.history.length > 0 };
}
