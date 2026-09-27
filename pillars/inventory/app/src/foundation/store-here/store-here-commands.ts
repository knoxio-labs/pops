import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { wirePlacement } from '../../inventory-web/item-verbs.js';
import { showUndoToast } from '../feedback/undo-toast.js';
import { storeTarget } from './store-here-model.js';

import type { BulkItemRefusal, useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import type { useItemVerbs } from '../../inventory-web/item-verbs.js';
import type { BatchCreate } from '../../inventory-web/useBatchCreate.js';
import type { ItemRowModel, StoreHereTarget } from '../model/contracts.js';

const NOT_SAVED_MESSAGE = 'Not saved. The inventory service did not answer.';
const CHANGED_ELSEWHERE_MESSAGE = 'The item changed while you were here. Try again.';

export interface StoreHereCommands {
  busy: boolean;
  created: string[];
  createError: string | null;
  create: (name: string) => Promise<boolean>;
  store: (items: readonly ItemRowModel[]) => Promise<void>;
  openTarget: () => Promise<void>;
}

interface StoreHereCommandOptions {
  target: StoreHereTarget;
  online: boolean;
  bulk: ReturnType<typeof useBulkItemVerbs>;
  itemVerbs: ReturnType<typeof useItemVerbs>;
  batch: BatchCreate;
  removeSelected: (ids: readonly string[]) => void;
}

interface BusyState {
  busy: boolean;
  begin: () => boolean;
  end: () => void;
}

function refusalMessage(refusal: BulkItemRefusal): string {
  if (refusal.kind === 'failed') return NOT_SAVED_MESSAGE;
  if (refusal.kind === 'no-previous-place') return CHANGED_ELSEWHERE_MESSAGE;
  return refusal.outcome.status === 'rejected'
    ? refusal.outcome.message
    : CHANGED_ELSEWHERE_MESSAGE;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : NOT_SAVED_MESSAGE;
}

function destinationFor(target: StoreHereTarget) {
  return wirePlacement(storeTarget(target));
}

function createRows(name: string) {
  return [{ code: '', name, note: '', quantity: '', type: '', where: '' }];
}

function useBusy(batch: BatchCreate): BusyState {
  const [busyState, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const begin = useCallback((): boolean => {
    if (busyRef.current || batch.isRunning) return false;
    busyRef.current = true;
    setBusyState(true);
    return true;
  }, [batch.isRunning]);
  const end = useCallback((): void => {
    busyRef.current = false;
    setBusyState(false);
  }, []);

  return { busy: busyState || batch.isRunning, begin, end };
}

function useCreateCommand(
  options: StoreHereCommandOptions,
  busy: BusyState
): Pick<StoreHereCommands, 'created' | 'createError' | 'create'> {
  const { batch, online, target } = options;
  const [created, setCreated] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const create = useCallback(
    async (name: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!online || trimmed === '' || !busy.begin()) return false;
      try {
        const result = await batch.commit(createRows(trimmed), destinationFor(target));
        const outcome = result.outcomes[0];
        if (outcome?.status === 'created') {
          setCreated((current) => [trimmed, ...current]);
          setCreateError(null);
          return true;
        }
        if (outcome?.status === 'invalid') {
          setCreateError(outcome.issues.map((issue) => issue.message).join(' '));
          return false;
        }
        setCreateError(NOT_SAVED_MESSAGE);
        return false;
      } catch {
        setCreateError(NOT_SAVED_MESSAGE);
        return false;
      } finally {
        busy.end();
      }
    },
    [batch, busy, online, target]
  );

  return { created, createError, create };
}

function useStoreCommand(
  options: StoreHereCommandOptions,
  busy: BusyState
): Pick<StoreHereCommands, 'store'> {
  const { bulk, online, removeSelected, target } = options;
  const store = useCallback(
    async (items: readonly ItemRowModel[]): Promise<void> => {
      const ids = [...new Set(items.map((item) => item.id))];
      if (!online || ids.length === 0 || !busy.begin()) return;
      try {
        const result = await bulk.store(ids, storeTarget(target));
        if (result.applied.length > 0) {
          removeSelected(result.applied);
          if (result.undo !== null) {
            showUndoToast({
              concept: 'move',
              message: `Stored ${result.applied.length} ${result.applied.length === 1 ? 'item' : 'items'} in ${target.name}.`,
              onUndo: result.undo,
            });
          }
        } else if (result.refused[0] !== undefined) {
          toast.error(refusalMessage(result.refused[0].refusal));
        }
      } catch (error: unknown) {
        toast.error(errorMessage(error));
      } finally {
        busy.end();
      }
    },
    [bulk, busy, online, removeSelected, target]
  );

  return { store };
}

function useOpenTargetCommand(
  options: StoreHereCommandOptions
): Pick<StoreHereCommands, 'openTarget'> {
  const { itemVerbs, online, target } = options;
  const openTarget = useCallback(async (): Promise<void> => {
    if (!online || target.kind !== 'container') return;
    try {
      const result = await itemVerbs.setAccess(target.id, 'open');
      if (result.status === 'applied') {
        if (result.undo !== null) {
          showUndoToast({
            concept: 'open',
            message: `Opened ${target.name}`,
            onUndo: result.undo,
          });
        }
        return;
      }
      toast.error(refusalMessage(result.refusal));
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    }
  }, [itemVerbs, online, target]);

  return { openTarget };
}

/** Runs Store here mutations with shared busy, refusal, offline, and Undo behavior. */
export function useStoreHereCommands(options: StoreHereCommandOptions): StoreHereCommands {
  const busy = useBusy(options.batch);
  const create = useCreateCommand(options, busy);
  const store = useStoreCommand(options, busy);
  const openTarget = useOpenTargetCommand(options);
  return { busy: busy.busy, ...create, ...store, ...openTarget };
}
