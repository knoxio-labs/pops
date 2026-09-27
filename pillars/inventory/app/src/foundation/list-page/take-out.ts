import { useCallback, useMemo, useState } from 'react';

import {
  allInHand,
  canLabel,
  canTakeOut,
  hasPreviousPlace,
  refusalReason,
  selectedOrFocusedIds,
  takeOutTarget,
} from './selection-actions.js';

import type { BulkItemVerbs, BulkResult } from '../../inventory-web/item-verbs-bulk.js';
import type { ItemRowModel, PlacementTarget } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { SelectionApi } from '../selection/use-selection.js';
import type { ShortcutHandlers } from '../shortcuts/shortcut-provider.js';
import type { SelectionActionId } from './selection-actions.js';

/** Runs one or more grouped placement writes and records their undo operations. */
export type TrackWrite = (
  ids: readonly string[],
  run: () => Promise<BulkResult>
) => Promise<BulkResult>;

/** The applied ids and one reverse-order undo for a Take out operation. */
export interface TakeOutRun {
  applied: string[];
  undo: (() => Promise<void>) | null;
}

/** The shared rejection state and tracked bulk-write wrapper for an item list. */
export interface TrackedWrites {
  rejections: Readonly<Record<string, string>>;
  track: TrackWrite;
  setRejection: (id: string, reason: string | null) => void;
}

/** Returns an optional feature-provided disabled reason for a known action id. */
export function extraDisabledReason(
  reasons: Partial<Record<SelectionActionId, string>> | undefined,
  id: string
): string | undefined {
  if (reasons === undefined) return undefined;
  return Object.entries(reasons).find(([key]) => key === id)?.[1];
}

/** Inputs for the list's placement keyboard shortcuts. */
export interface ListShortcutInput {
  rows: readonly ItemRowModel[];
  world: PlacementWorld;
  selection: SelectionApi;
  offline: boolean;
  runLabels: (ids: readonly string[]) => void;
  openPicker: (ids: readonly string[], mode: 'bulk' | 'row') => void;
  runBulkPickUp: (ids: readonly string[]) => Promise<void>;
  runPickUp: (id: string, itemName: string) => void;
  runTakeOut: (ids: readonly string[]) => Promise<void>;
  runPutBack: (
    id: string,
    itemName: string,
    target: PlacementTarget,
    world: PlacementWorld
  ) => void;
  setRejection: (id: string, reason: string | null) => void;
}

/** Creates placement and label shortcuts for one list page. */
export function listShortcutHandlers(input: ListShortcutInput): ShortcutHandlers {
  const ids = (): string[] => selectedOrFocusedIds(input.rows, input.selection);
  return {
    'pick-up': () => {
      const selected = ids();
      if (
        input.offline ||
        !selected.some((id) => input.world.items.has(id)) ||
        allInHand(input.world, selected)
      ) {
        return false;
      }
      if (input.selection.count > 0) {
        void input.runBulkPickUp(selected);
      } else {
        const row = input.rows.find((item) => item.id === selected[0]);
        if (row === undefined) return false;
        input.runPickUp(row.id, row.name);
      }
      return true;
    },
    move: () => {
      const selected = ids();
      if (input.offline || selected.length === 0) return false;
      input.openPicker(selected, input.selection.count > 0 ? 'bulk' : 'row');
      return true;
    },
    'take-out': () => {
      const selected = ids();
      if (input.offline || !canTakeOut(input.world, selected)) return false;
      void input.runTakeOut(selected);
      return true;
    },
    label: () => {
      const selected = ids();
      if (input.offline || !canLabel(selected)) return false;
      input.runLabels(selected);
      return true;
    },
    'put-back': () => {
      if (input.offline || input.selection.count > 0) return false;
      const row = input.rows.find((item) => item.id === input.selection.state.focusedId);
      if (row === undefined || !hasPreviousPlace(row)) {
        if (row !== undefined) {
          input.setRejection(row.id, refusalReason({ kind: 'no-previous-place' }));
        }
        return false;
      }
      const previous = row.previous;
      if (previous === null || previous.kind === 'deleted') return false;
      input.runPutBack(row.id, row.name, previous, input.world);
      return true;
    },
  };
}

interface TakeOutGroup {
  target: PlacementTarget;
  ids: string[];
}

/** Creates refusal bookkeeping that is shared by list verbs and optional handlers. */
export function useTrackedWrites(): TrackedWrites {
  const [rejections, setRejections] = useState<Record<string, string>>({});
  const setRejection = useCallback((id: string, reason: string | null): void => {
    setRejections((current) => {
      if (reason === null) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (current[id] === reason) return current;
      return { ...current, [id]: reason };
    });
  }, []);
  const track = useCallback<TrackWrite>(async (ids, run): Promise<BulkResult> => {
    setRejections((current) => {
      const next = { ...current };
      let changed = false;
      for (const id of new Set(ids)) {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    const result = await run();
    if (result.refused.length > 0) {
      setRejections((current) => {
        const next = { ...current };
        for (const refusal of result.refused) {
          next[refusal.id] = refusalReason(refusal.refusal);
        }
        return next;
      });
    }
    return result;
  }, []);

  return useMemo(() => ({ rejections, track, setRejection }), [rejections, setRejection, track]);
}

function targetKey(target: PlacementTarget): string {
  if (target.kind === 'in-hand') return 'in-hand';
  return `${target.kind}:${target.kind === 'location' ? target.locationId : target.containerId}`;
}

/** Takes selected items out of their containers, grouping writes by container placement. */
export async function runTakeOut(input: {
  world: PlacementWorld;
  ids: readonly string[];
  bulk: Pick<BulkItemVerbs, 'move' | 'pickUp'>;
  track: TrackWrite;
}): Promise<TakeOutRun> {
  const groups = new Map<string, TakeOutGroup>();
  for (const id of new Set(input.ids)) {
    const target = takeOutTarget(input.world, id);
    if (target === null) continue;
    const key = targetKey(target);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { target, ids: [id] });
    } else {
      group.ids.push(id);
    }
  }

  const applied: string[] = [];
  const undoers: Array<() => Promise<void>> = [];
  for (const group of groups.values()) {
    const result = await input.track(group.ids, () =>
      group.target.kind === 'in-hand'
        ? input.bulk.pickUp(group.ids)
        : input.bulk.move(group.ids, group.target)
    );
    applied.push(...result.applied);
    if (result.undo !== null) undoers.push(result.undo);
  }

  return {
    applied,
    undo:
      undoers.length === 0
        ? null
        : async () => {
            for (let index = undoers.length - 1; index >= 0; index -= 1) {
              const undo = undoers[index];
              if (undo !== undefined) await undo();
            }
          },
  };
}
