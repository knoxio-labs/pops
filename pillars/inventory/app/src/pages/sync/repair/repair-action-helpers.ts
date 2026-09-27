import type { InventoryMutationOutcome } from '../../../inventory-web/mutation-client.js';
import type { RepairActionId, RepairCase } from '../sync-model.js';
import type { WebAction } from './repair-plan.js';

/** Returns the type id carried by a repair case, when the report has one. */
export function typeIdFromRepair(repair: RepairCase): string | null {
  if (!('typeId' in repair)) return null;
  return typeof repair.typeId === 'string' ? repair.typeId : null;
}

/** Converts an unknown write failure into a user-facing message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'The inventory service could not save this change.';
}

/** Converts a refused inventory mutation into a user-facing message. */
export function outcomeReason(
  outcome: Exclude<InventoryMutationOutcome, { status: 'applied' }>
): string {
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

/** Returns whether an action writes or starts an upload. */
export function isWriteAction(actionId: RepairActionId): boolean {
  return (
    actionId === 'use-suggested' ||
    actionId === 'restore' ||
    actionId === 'upload' ||
    actionId === 'use-mine' ||
    actionId === 'save-fitting' ||
    actionId === 'change-type' ||
    actionId === 'restore-reference'
  );
}

function isNavigationAction(action: RepairActionId): boolean {
  return action === 'open-item' || action === 'open-holder' || action === 'choose-option';
}

function isUnidentifiedWrite(action: RepairActionId): boolean {
  return (
    action === 'use-mine' ||
    action === 'save-fitting' ||
    action === 'change-type' ||
    action === 'restore-reference'
  );
}

function actionNeedsItem(action: RepairActionId): boolean {
  return action === 'use-suggested' || action === 'upload' || action === 'open-type';
}

function itemStateReason(
  action: RepairActionId,
  repair: RepairCase,
  detail: { isPending: boolean; isError: boolean }
): string | null {
  if (!actionNeedsItem(action)) return null;
  if (detail.isPending) return `Loading ${repair.itemName}`;
  if (detail.isError) return `${repair.itemName} did not load`;
  return null;
}

function openTypeReason(
  action: WebAction,
  repair: RepairCase,
  device: string,
  detail: { typeId: string | null | undefined }
): string | null {
  if (action.id !== 'open-type' || typeIdFromRepair(repair) !== null) return null;
  if (repair.kind === 'now-required') {
    return `${repair.itemName} exists only on ${device} until it is sent.`;
  }
  if (detail.typeId === null) return `${repair.itemName} has no type`;
  return null;
}

function disabledActionReason(
  action: RepairActionId,
  disabledReason: string | undefined
): string | null {
  if (
    (action === 'use-suggested' || action === 'restore' || action === 'upload') &&
    disabledReason !== undefined
  ) {
    return disabledReason;
  }
  return null;
}

/** Returns the first reason that prevents a repair action from running. */
export function blockedReasonFor(
  action: WebAction,
  input: {
    repair: RepairCase;
    device: string;
    disabledReason?: string;
    detail: { typeId: string | null | undefined; isPending: boolean; isError: boolean };
  }
): string | null {
  const { repair, device, disabledReason, detail } = input;
  if (isNavigationAction(action.id)) return null;
  if (isUnidentifiedWrite(action.id)) {
    return `${device}'s report does not name it. Open ${repair.itemName} to change it.`;
  }
  const typeReason = openTypeReason(action, repair, device, detail);
  if (typeReason !== null) return typeReason;
  const disabled = disabledActionReason(action.id, disabledReason);
  if (disabled !== null) return disabled;
  const itemReason = itemStateReason(action.id, repair, detail);
  if (itemReason !== null) return itemReason;
  return null;
}
