import { useEffect, useMemo, useReducer, useState } from 'react';

import { OFFLINE_REASON } from '../../../foundation/feedback/state-banner.js';
import { useTrackedWrites } from '../../../foundation/list-page/take-out.js';
import { useBulkItemVerbs } from '../../../inventory-web/item-verbs-bulk.js';
import { useItemVerbs, usePendingItemIds } from '../../../inventory-web/item-verbs.js';
import { initialUnpack, unpackReducer } from './unpack-model.js';
import { containerSectionSpecs } from './workspace-details.js';

import type { Dispatch, SetStateAction } from 'react';

import type { TrackedWrites } from '../../../foundation/list-page/take-out.js';
import type { BulkItemVerbs } from '../../../inventory-web/item-verbs-bulk.js';
import type { ItemVerbs } from '../../../inventory-web/item-verbs.js';
import type { SectionSpec } from '../section-stack.js';
import type { UnpackAction, UnpackState } from './unpack-model.js';
import type { ContainerWorkspaceBodyProps } from './workspace-types.js';

/** The data and reducer state shared by the container workspace controllers. */
export interface ContainerWorkspaceState {
  bulk: BulkItemVerbs;
  itemVerbs: ItemVerbs;
  tracked: TrackedWrites;
  pendingIds: ReadonlySet<string>;
  state: UnpackState;
  dispatch: Dispatch<UnpackAction>;
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  mutationError: string | null;
  setMutationError: Dispatch<SetStateAction<string | null>>;
  currentAccess: 'open' | 'closed';
  readOnlyReason: string | undefined;
  sections: readonly SectionSpec[];
}

function readOnlyMessage(readOnly: boolean, offline: boolean): string | undefined {
  if (!readOnly) return undefined;
  return offline ? OFFLINE_REASON : 'Nothing can change on this item.';
}

/** Owns the container reducer and live mutation/query resources. */
export function useWorkspaceState({
  model,
  readOnly,
  offline,
  onLinksChanged,
  contents,
}: Pick<
  ContainerWorkspaceBodyProps,
  'model' | 'readOnly' | 'offline' | 'onLinksChanged' | 'contents'
>): ContainerWorkspaceState {
  const bulk = useBulkItemVerbs();
  const itemVerbs = useItemVerbs();
  const tracked = useTrackedWrites();
  const pendingIds = usePendingItemIds();
  const [state, dispatch] = useReducer(
    unpackReducer,
    { inside: contents.rows.map((row) => row.id), access: model.item.container?.access ?? 'open' },
    ({ inside, access }) => initialUnpack(inside, access)
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const currentAccess = model.item.container?.access ?? 'open';
  const readOnlyReason = readOnlyMessage(readOnly, offline);
  const sections = useMemo(
    () => containerSectionSpecs(model.item.id, model, readOnly, onLinksChanged),
    [model, onLinksChanged, readOnly]
  );
  useEffect(() => {
    if (currentAccess === state.access) return;
    dispatch({ type: currentAccess === 'open' ? 'open' : 'close' });
  }, [currentAccess, state.access]);
  useEffect(() => {
    dispatch({ type: 'sync', ids: contents.rows.map((row) => row.id) });
  }, [contents.rows]);
  return {
    bulk,
    itemVerbs,
    tracked,
    pendingIds,
    state,
    dispatch,
    detailsOpen,
    setDetailsOpen,
    mutationError,
    setMutationError,
    currentAccess,
    readOnlyReason,
    sections,
  };
}
