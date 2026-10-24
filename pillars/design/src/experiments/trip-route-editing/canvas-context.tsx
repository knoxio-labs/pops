import { createContext, useContext } from 'react';

import type { CaptureKind, CaptureTarget } from './canvas-actions';
import type { CanvasState } from './canvas-model';

/** Shared local actions keep every projection on the same source records. */
export interface CanvasActions {
  state: CanvasState;
  showDetails: boolean;
  preview: CanvasState;
  change: (state: CanvasState) => void;
  add: (kind: CaptureKind, title: string, target: CaptureTarget) => void;
  move: (id: string, target: CaptureTarget) => void;
  dragged: string | null;
  setDragged: (id: string | null) => void;
  hoverVisit: string | null;
  setHoverVisit: (id: string | null) => void;
  previewOrder: (ids: string[] | null) => void;
}
/** Prototype-only context; it owns no persistence or external side effects. */
export const CanvasContext = createContext<CanvasActions | null>(null);
/** Read the current route and its mutation actions from the planner provider. */
export function useCanvas(): CanvasActions {
  const context = useContext(CanvasContext);
  if (!context) throw new Error('Canvas provider required');
  return context;
}
/** Cross-container payload identifies the existing card rather than copying its contents. */
export const canvasDragType = 'application/x-pops-route-card';
