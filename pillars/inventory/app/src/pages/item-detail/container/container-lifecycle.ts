import { useCallback, useState } from 'react';

import { showUndoToast } from '../../../foundation/feedback/undo-toast.js';
import { restoreUnapplied, showBulkUndo } from './workspace-model.js';

import type { TrackedWrites } from '../../../foundation/list-page/take-out.js';
import type { BulkItemVerbs } from '../../../inventory-web/item-verbs-bulk.js';
import type { ItemVerbs } from '../../../inventory-web/item-verbs.js';
import type { UnpackAction, UnpackState } from './unpack-model.js';

type LifecycleAction = 'retire' | 'discard';

/** A pending bulk lifecycle dialog request. */
export interface PendingLifecycle {
  ids: readonly string[];
  act: LifecycleAction;
}

interface LifecycleMutationInput {
  pending: PendingLifecycle;
  reason: string | null;
  state: UnpackState;
  bulk: BulkItemVerbs;
  tracked: TrackedWrites;
  dispatch: (action: UnpackAction) => void;
}

async function executeLifecycle(input: LifecycleMutationInput): Promise<void> {
  const ids = [...new Set(input.pending.ids)].filter((id) => input.state.inside.includes(id));
  if (ids.length === 0) return;
  input.dispatch({ type: 'remove', ids });
  try {
    const lifecycle = input.pending.act === 'retire' ? 'retired' : 'discarded';
    const result = await input.tracked.track(ids, () =>
      input.bulk.setLifecycle(ids, lifecycle, input.reason)
    );
    restoreUnapplied(input.dispatch, ids, result.applied);
    showBulkUndo(
      result,
      lifecycle,
      `${input.pending.act === 'retire' ? 'Retired' : 'Discarded'} ${result.applied.length} ${result.applied.length === 1 ? 'item' : 'items'}`,
      input.dispatch
    );
  } catch {
    input.dispatch({ type: 'restore', ids });
    for (const id of ids) input.tracked.setRejection(id, 'The inventory service did not answer.');
  }
}

/** Provides the confirmation state and optimistic bulk lifecycle mutation. */
export function useContainerItemLifecycle({
  state,
  readOnly,
  bulk,
  tracked,
  dispatch,
}: {
  state: UnpackState;
  readOnly: boolean;
  bulk: BulkItemVerbs;
  tracked: TrackedWrites;
  dispatch: (action: UnpackAction) => void;
}): {
  lifecycle: PendingLifecycle | undefined;
  openLifecycle: (ids: readonly string[], act: LifecycleAction) => void;
  closeLifecycle: () => void;
  confirmLifecycle: (reason: string | null) => Promise<void>;
} {
  const [lifecycle, setLifecycle] = useState<PendingLifecycle>();
  const openLifecycle = useCallback(
    (ids: readonly string[], act: LifecycleAction): void => {
      if (readOnly || ids.length === 0) return;
      setLifecycle({ ids: [...new Set(ids)], act });
    },
    [readOnly]
  );
  const closeLifecycle = useCallback((): void => setLifecycle(undefined), []);
  const confirmLifecycle = useCallback(
    async (reason: string | null): Promise<void> => {
      const pending = lifecycle;
      setLifecycle(undefined);
      if (pending === undefined || readOnly) return;
      await executeLifecycle({ pending, reason, state, bulk, tracked, dispatch });
    },
    [bulk, dispatch, lifecycle, readOnly, state, tracked]
  );
  return { lifecycle, openLifecycle, closeLifecycle, confirmLifecycle };
}

type AccessInput = {
  itemId: string;
  itemName: string;
  currentAccess: 'open' | 'closed';
  phase: UnpackState['phase'];
  readOnly: boolean;
  itemVerbs: ItemVerbs;
  dispatch: (action: UnpackAction) => void;
  setMutationError: (message: string | null) => void;
};

function useOpenContainerAction({
  itemId,
  currentAccess,
  readOnly,
  itemVerbs,
  dispatch,
  setMutationError,
}: AccessInput): () => void {
  const openContainer = useCallback((): void => {
    if (readOnly || currentAccess === 'open') return;
    setMutationError(null);
    dispatch({ type: 'open' });
    void itemVerbs.setAccess(itemId, 'open').then(
      (result) => {
        if (result.status === 'refused') {
          dispatch({ type: 'close' });
          setMutationError(
            result.refusal.kind === 'failed'
              ? result.refusal.error.message
              : 'The container could not be opened.'
          );
        }
      },
      () => {
        dispatch({ type: 'close' });
        setMutationError('The inventory service did not answer.');
      }
    );
  }, [currentAccess, dispatch, itemId, itemVerbs, readOnly, setMutationError]);
  return openContainer;
}

function useRetireEmptyAction({
  itemId,
  itemName,
  phase,
  readOnly,
  itemVerbs,
  dispatch,
  setMutationError,
}: AccessInput): () => void {
  const retireEmpty = useCallback((): void => {
    if (readOnly || phase !== 'confirm-retire') return;
    setMutationError(null);
    dispatch({ type: 'retire' });
    void itemVerbs.setLifecycle(itemId, 'retired', null).then(
      (result) => {
        if (result.status === 'refused') {
          dispatch({ type: 'retire-failed' });
          setMutationError('The container could not be retired.');
          return;
        }
        if (result.undo !== null) {
          showUndoToast({
            concept: 'retired',
            message: `Retired ${itemName}`,
            onUndo: async () => {
              await result.undo?.();
              dispatch({ type: 'restore-retired' });
            },
          });
        }
      },
      () => {
        dispatch({ type: 'retire-failed' });
        setMutationError('The inventory service did not answer.');
      }
    );
  }, [dispatch, itemId, itemName, itemVerbs, phase, readOnly, setMutationError]);
  return retireEmpty;
}

/** Provides optimistic access and empty-container retirement actions. */
export function useContainerAccessActions(input: AccessInput): {
  openContainer: () => void;
  retireEmpty: () => void;
} {
  const openContainer = useOpenContainerAction(input);
  const retireEmpty = useRetireEmptyAction(input);
  return { openContainer, retireEmpty };
}
