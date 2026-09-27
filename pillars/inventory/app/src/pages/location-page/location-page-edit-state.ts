import { useState } from 'react';

import type { DeletePlaceState, PlaceMoveNotice } from './location-page-parts.js';

/** Internal state setters shared by the page-local place action callbacks. */
export interface EditState {
  readonly creatingUnder: string | null;
  readonly renamingId: string | null;
  readonly deleting: DeletePlaceState | null;
  readonly lastMove: PlaceMoveNotice | null;
  readonly error: string | null;
  readonly setCreatingUnder: (id: string | null) => void;
  readonly setRenamingId: (id: string | null) => void;
  readonly setDeleting: (state: DeletePlaceState | null) => void;
  readonly setLastMove: (notice: PlaceMoveNotice | null) => void;
  readonly setError: (message: string | null) => void;
}

/** Creates the local state used by location-page place edits. */
export function useEditState(): EditState {
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DeletePlaceState | null>(null);
  const [lastMove, setLastMove] = useState<PlaceMoveNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  return {
    creatingUnder,
    renamingId,
    deleting,
    lastMove,
    error,
    setCreatingUnder,
    setRenamingId,
    setDeleting,
    setLastMove,
    setError,
  };
}
