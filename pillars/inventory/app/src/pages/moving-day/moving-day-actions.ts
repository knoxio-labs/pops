import { useCallback, useState } from 'react';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { targetName } from '../../foundation/model/placement-model.js';
import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { useItemVerbs, usePendingItemIds } from '../../inventory-web/item-verbs.js';

import type { FixedPlacement, PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type {
  BulkItemRefusal,
  BulkItemVerbs,
  BulkResult,
} from '../../inventory-web/item-verbs-bulk-types.js';
import type { ItemVerbs, VerbRefusal } from '../../inventory-web/item-verbs.js';
import type { MovingBox, MovingBoxStage } from './moving-day-model.js';

/** One reversible stage action offered by a moving-day box. */
export type BoxAction = 'mark-full' | 'close' | 'open';

/** The typed state mutation performed by a box action. */
export type BoxMutation =
  | { readonly kind: 'full'; readonly value: boolean }
  | { readonly kind: 'access'; readonly value: 'open' | 'closed' };

/** The page-level command and refusal state used by moving-day controls. */
export interface MovingDayActions {
  readonly onBoxAction: (box: MovingBox, action: BoxAction) => void;
  readonly onPack: (ids: readonly string[], target: PlacementTarget) => void;
  readonly pendingIds: ReadonlySet<string>;
  readonly rejections: Readonly<Record<string, string>>;
}

/** Returns the actions available for a box at a given stage. */
export function actionsFor(stage: MovingBoxStage): readonly BoxAction[] {
  if (stage === 'packing') return ['mark-full', 'close'];
  if (stage === 'full') return ['close', 'open'];
  return ['open'];
}

/** Returns the button label for a stage action. */
export function actionLabel(action: BoxAction, stage: MovingBoxStage): string {
  if (action === 'mark-full') return 'Mark full';
  if (action === 'close') return 'Close box';
  return stage === 'full' ? 'Not full' : 'Reopen';
}

/** Returns the mutation represented by an action without contacting the server. */
export function mutationFor(stage: MovingBoxStage, action: BoxAction): BoxMutation {
  if (action === 'mark-full') return { kind: 'full', value: true };
  if (action === 'close') return { kind: 'access', value: 'closed' };
  return stage === 'full' ? { kind: 'full', value: false } : { kind: 'access', value: 'open' };
}

/** Returns the undo toast copy for a completed box action. */
export function actionMessage(action: BoxAction, name: string, stage: MovingBoxStage): string {
  if (action === 'mark-full') return `Marked ${name} full`;
  if (action === 'close') return `Closed ${name}`;
  return stage === 'full' ? `Marked ${name} not full` : `Reopened ${name}`;
}

/** Explains why a moving-day mutation cannot currently be used. */
export function actionDisabledReason(online: boolean, ready: boolean): string | undefined {
  if (!online) return OFFLINE_REASON;
  return ready ? undefined : 'Loading item placements.';
}

/** Converts a bulk or single-item refusal into user-facing page copy. */
export function refusalMessage(refusal: VerbRefusal | BulkItemRefusal): string {
  if (refusal.kind === 'failed') return 'The inventory service did not answer.';
  if (refusal.kind === 'no-previous-place') return 'This item has no remembered place.';
  return 'message' in refusal.outcome && typeof refusal.outcome.message === 'string'
    ? refusal.outcome.message
    : 'The inventory service rejected this action.';
}

function applyBulkRejections(
  previous: Readonly<Record<string, string>>,
  ids: readonly string[],
  result: BulkResult
): Readonly<Record<string, string>> {
  const next = { ...previous };
  ids.forEach((id) => delete next[id]);
  result.refused.forEach(({ id, refusal }) => {
    next[id] = refusalMessage(refusal);
  });
  return next;
}

function fixedTarget(target: PlacementTarget): FixedPlacement | null {
  if (target.kind === 'in-hand') return null;
  return target;
}

async function runBoxMutation(
  box: MovingBox,
  action: BoxAction,
  verbs: ItemVerbs,
  setRejection: (id: string, reason: string) => void
): Promise<void> {
  try {
    const mutation = mutationFor(box.stage, action);
    const result =
      mutation.kind === 'full'
        ? await verbs.setFull(box.id, mutation.value)
        : await verbs.setAccess(box.id, mutation.value);
    if (result.status === 'refused') {
      setRejection(box.id, refusalMessage(result.refusal));
      return;
    }
    if (result.undo !== null) {
      showUndoToast({
        concept: mutation.kind === 'full' ? 'full' : mutation.value,
        message: actionMessage(action, box.name, box.stage),
        onUndo: result.undo,
      });
    }
  } catch {
    setRejection(box.id, 'The inventory service did not answer.');
  }
}

async function runPack(options: {
  readonly ids: readonly string[];
  readonly target: FixedPlacement;
  readonly world: PlacementWorld;
  readonly verbs: BulkItemVerbs;
  readonly applyResult: (ids: readonly string[], result: BulkResult) => void;
  readonly setFailure: (ids: readonly string[]) => void;
}): Promise<void> {
  const { ids, target, world, verbs, applyResult, setFailure } = options;
  try {
    const result =
      target.kind === 'location' ? await verbs.move(ids, target) : await verbs.store(ids, target);
    applyResult(ids, result);
    if (result.applied.length > 0 && result.undo !== null) {
      showUndoToast({
        concept: target.kind === 'container' ? 'container' : 'move',
        message:
          target.kind === 'container'
            ? `Packed ${result.applied.length} ${result.applied.length === 1 ? 'thing' : 'things'} into ${targetName(world, target)}`
            : `Moved ${result.applied.length} ${result.applied.length === 1 ? 'thing' : 'things'} to ${targetName(world, target)}`,
        onUndo: result.undo,
      });
    }
  } catch {
    setFailure(ids);
  }
}

/** Binds moving-day stage actions and placement commands to existing item verbs. */
export function useMovingDayActions({
  online,
  ready,
  world,
}: {
  readonly online: boolean;
  readonly ready: boolean;
  readonly world: PlacementWorld;
}): MovingDayActions {
  const verbs = useItemVerbs();
  const bulkVerbs = useBulkItemVerbs();
  const pendingIds = usePendingItemIds();
  const [rejections, setRejections] = useState<Readonly<Record<string, string>>>({});

  const clearRejections = useCallback((ids: readonly string[]): void => {
    setRejections((previous) => {
      const next = { ...previous };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  }, []);

  const setFailure = useCallback((ids: readonly string[]): void => {
    setRejections((previous) => {
      const next = { ...previous };
      ids.forEach((id) => {
        next[id] = 'The inventory service did not answer.';
      });
      return next;
    });
  }, []);

  const applyResult = useCallback((ids: readonly string[], result: BulkResult): void => {
    setRejections((previous) => applyBulkRejections(previous, ids, result));
  }, []);

  const onBoxAction = useCallback(
    (box: MovingBox, action: BoxAction): void => {
      if (!online || !ready || pendingIds.has(box.id)) return;
      clearRejections([box.id]);
      void runBoxMutation(box, action, verbs, (id, reason) => {
        setRejections((previous) => ({ ...previous, [id]: reason }));
      });
    },
    [clearRejections, online, pendingIds, ready, verbs]
  );

  const onPack = useCallback(
    (ids: readonly string[], target: PlacementTarget): void => {
      const destination = fixedTarget(target);
      if (!online || !ready || destination === null || ids.length === 0) return;
      clearRejections(ids);
      void runPack({
        ids,
        target: destination,
        world,
        verbs: bulkVerbs,
        applyResult,
        setFailure,
      });
    },
    [applyResult, bulkVerbs, clearRejections, online, ready, setFailure, world]
  );

  return { onBoxAction, onPack, pendingIds, rejections };
}
