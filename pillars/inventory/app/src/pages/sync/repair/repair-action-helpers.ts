import { hasRepairWritePayload } from './repair-write-payloads.js';

import type { InventoryMutationOutcome } from '../../../inventory-web/mutation-client.js';
import type { ChangeTypeWrite } from './repair-targets.js';

export {
  fittingValuesFor,
  mineTargetFor,
  referenceValueFor,
  typeReplacementFor,
} from './repair-write-payloads.js';
export { changeTypeWrite } from './repair-targets.js';

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

function actionNeedsItem(action: RepairActionId): boolean {
  return (
    action === 'use-suggested' ||
    action === 'upload' ||
    action === 'open-type' ||
    action === 'change-type'
  );
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
    (action === 'use-suggested' ||
      action === 'restore' ||
      action === 'upload' ||
      action === 'use-mine' ||
      action === 'save-fitting' ||
      action === 'change-type' ||
      action === 'restore-reference') &&
    disabledReason !== undefined
  ) {
    return disabledReason;
  }
  return null;
}

function joinFieldNames(fields: readonly string[]): string {
  if (fields.length < 2) return fields[0] ?? '';
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`;
}

function reportReason(repair: RepairCase, device: string): string {
  return `${device}'s report does not name it. Open ${repair.itemName} to change it.`;
}

function changeTypeReason(input: {
  action: WebAction;
  repair: RepairCase;
  device: string;
  catalogueStatus: 'pending' | 'error' | 'success';
  write: ChangeTypeWrite | null;
}): string | null {
  if (input.action.id !== 'change-type') return null;
  if (input.catalogueStatus === 'pending') return 'Loading the catalogue';
  if (input.catalogueStatus === 'error') return 'The catalogue did not load';
  if (input.write === null) return reportReason(input.repair, input.device);
  if (input.write.kind === 'unmatched') {
    return `No field on ${input.write.replacement} matches ${joinFieldNames(input.write.fields)}.`;
  }
  return null;
}

function payloadReason(
  action: WebAction,
  repair: RepairCase,
  device: string,
  input: Parameters<typeof blockedReasonFor>[1]
): string | null {
  const hasCatalogueContext = input.catalogueStatus !== undefined || input.changeType !== undefined;
  if (hasCatalogueContext) {
    const reason = changeTypeReason({
      action,
      repair,
      device,
      catalogueStatus: input.catalogueStatus ?? 'success',
      write: input.changeType ?? null,
    });
    if (reason !== null) return reason;
  }
  if (
    (action.id !== 'change-type' || !hasCatalogueContext) &&
    !hasRepairWritePayload(action.id, repair)
  ) {
    return reportReason(repair, device);
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
    catalogueStatus?: 'pending' | 'error' | 'success';
    changeType?: ChangeTypeWrite | null;
    detail: { typeId: string | null | undefined; isPending: boolean; isError: boolean };
  }
): string | null {
  const { repair, device, disabledReason, detail } = input;
  if (isNavigationAction(action.id)) return null;
  const payload = payloadReason(action, repair, device, input);
  if (payload !== null) return payload;
  const openType = openTypeReason(action, repair, device, detail);
  if (openType !== null) return openType;
  const itemReason = itemStateReason(action.id, repair, detail);
  if (itemReason !== null) return itemReason;
  const disabled = disabledActionReason(action.id, disabledReason);
  if (disabled !== null) return disabled;
  return null;
}
