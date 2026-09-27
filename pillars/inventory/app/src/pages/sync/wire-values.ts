import type { FieldWireValue } from '../../inventory-web/commands.js';

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function optionValue(value: Record<string, unknown>): FieldWireValue | null {
  return exactKeys(value, ['optionId']) && typeof value.optionId === 'string'
    ? { optionId: value.optionId }
    : null;
}

function measurementValue(value: Record<string, unknown>): FieldWireValue | null {
  return exactKeys(value, ['amount', 'unit']) &&
    typeof value.amount === 'string' &&
    typeof value.unit === 'string'
    ? { amount: value.amount, unit: value.unit }
    : null;
}

function referenceValue(value: Record<string, unknown>): FieldWireValue | null {
  return exactKeys(value, ['targetKind', 'targetId']) &&
    (value.targetKind === 'item' || value.targetKind === 'location') &&
    typeof value.targetId === 'string'
    ? { targetKind: value.targetKind, targetId: value.targetId }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wireValue(value: unknown): FieldWireValue | null {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (!isRecord(value)) return null;
  return optionValue(value) ?? measurementValue(value) ?? referenceValue(value);
}

/** Narrows ledger JSON to the exact stable values accepted by inventory commands. */
export function toWireValues(values: readonly unknown[]): FieldWireValue[] | null {
  const narrowed = values.map(wireValue);
  return narrowed.some((value) => value === null)
    ? null
    : narrowed.filter((value): value is FieldWireValue => value !== null);
}
