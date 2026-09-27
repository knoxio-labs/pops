import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { initialRows, countRows } from './bulk-entry-model.js';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { PlacementTarget } from '../../foundation/model/model.js';
import type { InventoryApiError } from '../../inventory-api-helpers.js';
import type { BatchProgress } from '../../inventory-web/batch-commit.js';
import type { BulkCounts, BulkPhase, BulkRowState } from './bulk-entry-types.js';

type Setter<T> = Dispatch<SetStateAction<T>>;

function useSyncedRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function useRowsState(): {
  rows: BulkRowState[];
  rowsRef: MutableRefObject<BulkRowState[]>;
  replaceRows: (rows: BulkRowState[]) => void;
} {
  const [rows, setRows] = useState<BulkRowState[]>(initialRows);
  const rowsRef = useSyncedRef(rows);
  const replaceRows = useCallback(
    (nextRows: BulkRowState[]): void => {
      rowsRef.current = nextRows;
      setRows(nextRows);
    },
    [rowsRef]
  );
  return { rows, rowsRef, replaceRows };
}

function useDefaultsState(
  initial: { destination: PlacementTarget; defaultTypeKey: string | null },
  types: readonly FilterOption[]
): {
  destination: PlacementTarget;
  updateDestination: (destination: PlacementTarget) => void;
  destinationRef: MutableRefObject<PlacementTarget>;
  defaultTypeKey: string | null;
  updateDefaultTypeKey: (key: string | null) => void;
  defaultTypeKeyRef: MutableRefObject<string | null>;
  typesRef: MutableRefObject<readonly FilterOption[]>;
} {
  const [destination, setDestinationState] = useState<PlacementTarget>(() => initial.destination);
  const [defaultTypeKey, setDefaultTypeKeyState] = useState<string | null>(
    () => initial.defaultTypeKey
  );
  const destinationRef = useSyncedRef(destination);
  const defaultTypeKeyRef = useSyncedRef(defaultTypeKey);
  const updateDestination = useCallback(
    (next: PlacementTarget): void => {
      destinationRef.current = next;
      setDestinationState(next);
    },
    [destinationRef]
  );
  const updateDefaultTypeKey = useCallback(
    (next: string | null): void => {
      defaultTypeKeyRef.current = next;
      setDefaultTypeKeyState(next);
    },
    [defaultTypeKeyRef]
  );
  return {
    destination,
    updateDestination,
    destinationRef,
    defaultTypeKey,
    updateDefaultTypeKey,
    defaultTypeKeyRef,
    typesRef: useSyncedRef(types),
  };
}

function useOutcomeState(): {
  pasteNote: string;
  setPasteNote: Setter<string>;
  progress: BatchProgress | null;
  setProgress: Setter<BatchProgress | null>;
  createdIds: string[];
  setCreatedIds: Setter<string[]>;
  createdCount: number;
  setCreatedCount: Setter<number>;
  error: ReturnType<typeof useErrorState>['error'];
  setError: ReturnType<typeof useErrorState>['setError'];
} {
  const [pasteNote, setPasteNote] = useState('');
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [createdCount, setCreatedCount] = useState(0);
  const { error, setError } = useErrorState();
  return {
    pasteNote,
    setPasteNote,
    progress,
    setProgress,
    createdIds,
    setCreatedIds,
    createdCount,
    setCreatedCount,
    error,
    setError,
  };
}

function useErrorState() {
  const [error, setError] = useState<InventoryApiError | null>(null);
  return { error, setError };
}

/** Internal state and refs shared by the bulk-entry workflow hooks. */
export interface BulkEntryState {
  rows: BulkRowState[];
  rowsRef: MutableRefObject<BulkRowState[]>;
  replaceRows: (rows: BulkRowState[]) => void;
  phase: BulkPhase;
  setPhase: Setter<BulkPhase>;
  destination: PlacementTarget;
  updateDestination: (destination: PlacementTarget) => void;
  destinationRef: MutableRefObject<PlacementTarget>;
  defaultTypeKey: string | null;
  updateDefaultTypeKey: (key: string | null) => void;
  defaultTypeKeyRef: MutableRefObject<string | null>;
  typesRef: MutableRefObject<readonly FilterOption[]>;
  pasteNote: string;
  setPasteNote: Setter<string>;
  progress: BatchProgress | null;
  setProgress: Setter<BatchProgress | null>;
  createdIds: string[];
  setCreatedIds: Setter<string[]>;
  createdCount: number;
  setCreatedCount: Setter<number>;
  error: InventoryApiError | null;
  setError: Setter<InventoryApiError | null>;
  validationPending: boolean;
  setValidationPending: Setter<boolean>;
  onlineRef: MutableRefObject<boolean>;
  counts: BulkCounts;
}

/** Creates the controlled grid, defaults, phase, progress, and error state. */
export function useBulkEntryState(
  initial: { destination: PlacementTarget; defaultTypeKey: string | null },
  types: readonly FilterOption[],
  online: boolean
): BulkEntryState {
  const rowsState = useRowsState();
  const defaults = useDefaultsState(initial, types);
  const outcome = useOutcomeState();
  const [phase, setPhase] = useState<BulkPhase>('editing');
  const [validationPending, setValidationPending] = useState(false);
  const onlineRef = useSyncedRef(online);
  const counts = useMemo(
    () => countRows(rowsState.rows, outcome.createdCount),
    [outcome.createdCount, rowsState.rows]
  );

  return {
    ...rowsState,
    ...defaults,
    ...outcome,
    phase,
    setPhase,
    validationPending,
    setValidationPending,
    onlineRef,
    counts,
  };
}
