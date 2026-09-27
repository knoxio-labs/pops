import type {
  FieldValueEntry,
  FieldValuePatch,
  FieldWireValue,
} from '../../../inventory-web/commands.js';
import type { HeldValue, RepairActionId, RepairCase } from '../sync-model.js';

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionValue(value: Record<string, unknown>): boolean {
  return typeof value.optionId === 'string' && value.optionId.length > 0;
}

function isMeasurementValue(value: Record<string, unknown>): boolean {
  return typeof value.amount === 'string' && typeof value.unit === 'string';
}

function isReferenceValue(value: Record<string, unknown>): boolean {
  return (
    (value.targetKind === 'item' || value.targetKind === 'location') &&
    typeof value.targetId === 'string' &&
    value.targetId.length > 0
  );
}

function isFieldWireValue(value: unknown): value is FieldWireValue {
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!isRecord(value)) return false;
  return isOptionValue(value) || isMeasurementValue(value) || isReferenceValue(value);
}

function fieldValuesFor(
  values: readonly unknown[] | null | undefined
): readonly FieldWireValue[] | null {
  if (
    values === undefined ||
    values === null ||
    values.length === 0 ||
    !values.every(isFieldWireValue)
  ) {
    return null;
  }
  return values;
}

function fieldEntryFor(value: HeldValue): FieldValueEntry | null {
  if (!nonEmpty(value.fieldId)) return null;
  const values = fieldValuesFor(value.values);
  return values === null ? null : { fieldId: value.fieldId, values };
}

function fieldPatchFor(
  fieldId: string | undefined,
  values: readonly unknown[] | null | undefined
): FieldValuePatch | null {
  if (!nonEmpty(fieldId)) return null;
  if (values === null) return { fieldId, values: null };
  const validValues = fieldValuesFor(values);
  return validValues === null ? null : { fieldId, values: validValues };
}

/** The normalized target of a device-side conflict that the web can apply. */
export type RepairMineTarget =
  | { kind: 'location'; locationId: string }
  | { kind: 'container'; containerId: string }
  | { kind: 'hand' }
  | { kind: 'name'; value: string }
  | { kind: 'note'; value: string | null }
  | { kind: 'field'; patch: FieldValuePatch };

function locationTargetFor(locationId: string | undefined): RepairMineTarget | null {
  return nonEmpty(locationId) ? { kind: 'location', locationId } : null;
}

function containerTargetFor(containerId: string | undefined): RepairMineTarget | null {
  return nonEmpty(containerId) ? { kind: 'container', containerId } : null;
}

function nameTargetFor(name: string | undefined): RepairMineTarget | null {
  return nonEmpty(name) ? { kind: 'name', value: name } : null;
}

function noteTargetFor(note: string | null | undefined): RepairMineTarget | null {
  return note === undefined ? null : { kind: 'note', value: note };
}

function fieldTargetFor(
  fieldId: string | undefined,
  values: readonly unknown[] | null | undefined
): RepairMineTarget | null {
  const patch = fieldPatchFor(fieldId, values);
  return patch === null ? null : { kind: 'field', patch };
}

/** Returns the safe, stable target carried by a device-side conflict. */
export function mineTargetFor(repair: RepairCase): RepairMineTarget | null {
  const target = repair.mine?.target;
  if (target === undefined) return null;
  switch (target.kind) {
    case 'location':
      return locationTargetFor(target.locationId);
    case 'container':
      return containerTargetFor(target.containerId);
    case 'hand':
      return { kind: 'hand' };
    case 'name':
      return nameTargetFor(target.name);
    case 'note':
      return noteTargetFor(target.note);
    case 'field':
      return fieldTargetFor(target.fieldId, target.values);
    default:
      return null;
  }
}

/** Returns all held values that can be safely saved with a stable field id. */
export function fittingValuesFor(repair: RepairCase): FieldValueEntry[] | null {
  const fitting = (repair.held?.values ?? []).filter((value) => value.fit === 'fits');
  if (fitting.length === 0) return null;
  const entries = fitting.map(fieldEntryFor);
  return entries.some((entry) => entry === null)
    ? null
    : entries.filter((entry): entry is FieldValueEntry => entry !== null);
}

/** The stable type replacement and values carried by a type-replacement case. */
export interface RepairTypeReplacement {
  typeId: string;
  values: FieldValueEntry[];
}

/** Returns the safe type replacement payload reported by the device. */
export function typeReplacementFor(repair: RepairCase): RepairTypeReplacement | null {
  const held = repair.held?.values ?? [];
  const typeId = held.find((value) => nonEmpty(value.replacementTypeId))?.replacementTypeId;
  if (!nonEmpty(typeId)) return null;
  const fitting = held.filter((value) => value.fit === 'fits').map(fieldEntryFor);
  return fitting.some((entry) => entry === null)
    ? null
    : {
        typeId,
        values: fitting.filter((entry): entry is FieldValueEntry => entry !== null),
      };
}

/** Returns the stable field patch that restores a missing reference record. */
export function referenceValueFor(repair: RepairCase): FieldValuePatch | null {
  const reference = repair.held?.values.find((value) => value.fit === 'record-gone');
  if (
    reference === undefined ||
    !nonEmpty(reference.fieldId) ||
    !nonEmpty(reference.recordId) ||
    (reference.recordKind !== 'item' && reference.recordKind !== 'location')
  ) {
    return null;
  }
  return {
    fieldId: reference.fieldId,
    values: [{ targetKind: reference.recordKind, targetId: reference.recordId }],
  };
}

/** Returns whether a repair action has enough stable data for the web to apply it. */
export function hasRepairWritePayload(action: RepairActionId, repair: RepairCase): boolean {
  if (action === 'use-mine') return mineTargetFor(repair) !== null;
  if (action === 'save-fitting') return fittingValuesFor(repair) !== null;
  if (action === 'change-type') return typeReplacementFor(repair) !== null;
  if (action === 'restore-reference') return referenceValueFor(repair) !== null;
  return true;
}
