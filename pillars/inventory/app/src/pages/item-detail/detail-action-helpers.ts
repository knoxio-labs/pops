import { showUndoToast } from '../../foundation/feedback/undo-toast';

import type { PlacementTarget } from '../../foundation/model';
import type { InventoryConcept } from '../../foundation/model/icons';
import type { ItemVerbs, VerbRefusal, VerbResult } from '../../inventory-web/item-verbs';
import type { DetailVerb, DetailVerbs, MenuEntry } from './detail-verbs';

/** The lifecycle wire value corresponding to a dialog action. */
export const LIFECYCLE_FOR_DIALOG = {
  retire: 'retired',
  lost: 'lost',
  discard: 'discarded',
  destroy: 'destroyed',
} as const;

/** The icon/toast concept corresponding to a lifecycle dialog action. */
export const CONCEPT_FOR_DIALOG: Readonly<
  Record<keyof typeof LIFECYCLE_FOR_DIALOG, InventoryConcept>
> = {
  retire: 'retired',
  lost: 'lost',
  discard: 'discarded',
  destroy: 'destroyed',
};

/** The mutation runner signature shared by item-detail callbacks. */
export type MutationRunner = (
  operation: Promise<VerbResult>,
  concept: InventoryConcept,
  message: string,
  showToast?: boolean
) => Promise<VerbResult | null>;

/** Converts an unknown mutation failure into inline item-detail copy. */
export function errorReason(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'The inventory service could not save this change.';
}

/** Converts a refused item verb into a useful inline explanation. */
export function refusalReason(refusal: VerbRefusal): string {
  if (refusal.kind === 'failed') return refusal.error.message;

  const outcome = refusal.outcome;
  if (outcome.status === 'rejected') return outcome.reason || outcome.message;
  if (outcome.status === 'deferred') return `Waiting on ${outcome.waitingOn}.`;
  if ('field' in outcome && typeof outcome.field === 'string') {
    return `The ${outcome.field} changed elsewhere.`;
  }
  if ('heldBy' in outcome && typeof outcome.heldBy.name === 'string') {
    return `That code is already held by ${outcome.heldBy.name}.`;
  }
  if (outcome.kind === 'deleted') return 'The item was deleted elsewhere.';
  return 'The inventory service refused this change.';
}

/** Creates the single-item mutation runner used by all detail actions. */
export function createMutationRunner(
  setRefusal: (reason: string | null) => void,
  onOpenHistory: () => void
): MutationRunner {
  return async (operation, concept, message, showToast = true) => {
    try {
      const result = await operation;
      if (result.status === 'refused') {
        setRefusal(refusalReason(result.refusal));
        return result;
      }
      if (showToast && result.undo !== null) {
        showUndoToast({ concept, message, onUndo: result.undo, onOpenHistory });
      }
      return result;
    } catch (error: unknown) {
      setRefusal(errorReason(error));
      return null;
    }
  };
}

/** Finds a visible header verb by its stable shortcut/action id. */
export function findVerb(verbs: DetailVerbs, id: DetailVerb['id']): DetailVerb | null {
  const candidates = [verbs.primary, ...verbs.secondary, verbs.edit];
  return candidates.find((candidate): candidate is DetailVerb => candidate?.id === id) ?? null;
}

/** Finds a visible More-menu entry by id. */
export function findMenuEntry(verbs: DetailVerbs, id: string): MenuEntry | null {
  return verbs.menu.flat().find((entry) => entry.id === id) ?? null;
}

/** Removes the in-hand target variant before calling the fixed-placement verb. */
export function fixedTarget(
  target: PlacementTarget
): Exclude<PlacementTarget, { kind: 'in-hand' }> | null {
  return target.kind === 'in-hand' ? null : target;
}

/** Builds the route shared by list-neighbour navigation and Copy link. */
export function itemPath(id: string): string {
  return `/inventory/items/${id}`;
}

/** Copies a value through the browser clipboard or reports that it is unavailable. */
export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard === undefined) throw new Error('Clipboard access is unavailable.');
  await navigator.clipboard.writeText(value);
}

/** The lifecycle action copy used by the detail action runner. */
export function lifecycleMessage(
  dialog: keyof typeof LIFECYCLE_FOR_DIALOG,
  itemName: string
): string {
  if (dialog === 'retire') return `Retired ${itemName}`;
  if (dialog === 'lost') return `Marked lost: ${itemName}`;
  if (dialog === 'discard') return `Discarded ${itemName}`;
  return `Destroyed ${itemName}`;
}

/** The concrete item verbs available to callback factories. */
export type DetailItemVerbs = ItemVerbs;
