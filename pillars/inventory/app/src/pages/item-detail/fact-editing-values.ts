import { formTypesOf, type FieldDrafts, type ReferenceChoice } from '../item-form/field-model';

import type { PlacementWorld } from '../../foundation/model';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups';

/** One stored field snapshot accepted by the draft conversion helper. */
export interface FactValueInput {
  fieldId: string;
  values: readonly unknown[];
}

function isReferenceValue(
  value: unknown
): value is { targetId: string; targetKind: 'item' | 'location' } {
  if (typeof value !== 'object' || value === null) return false;
  if (!('targetId' in value) || !('targetKind' in value)) return false;
  return (
    typeof value.targetId === 'string' &&
    (value.targetKind === 'item' || value.targetKind === 'location')
  );
}

function optionValue(value: object): string | null {
  if (!('optionId' in value)) return null;
  return typeof value.optionId === 'string' ? value.optionId : '';
}

function amountValue(value: object): string | null {
  if (!('amount' in value)) return null;
  return typeof value.amount === 'string' ? value.amount : '';
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && value !== null) {
    return optionValue(value) ?? amountValue(value) ?? JSON.stringify(value) ?? '';
  }
  return JSON.stringify(value) ?? '';
}

function referenceLabel(
  reference: { targetId: string; targetKind: 'item' | 'location' },
  world: PlacementWorld
): string {
  if (reference.targetKind === 'item') {
    return world.items.get(reference.targetId)?.name ?? 'Unknown item';
  }
  return world.locations.get(reference.targetId)?.name ?? 'Unknown place';
}

function catalogueTypesFor(
  type: CatalogueType | null,
  types: readonly CatalogueType[] | undefined
): readonly CatalogueType[] {
  if (types !== undefined) return types;
  if (type === null) return [];
  return [type];
}

function formTypeFor(
  type: CatalogueType | null,
  types: readonly CatalogueType[] | undefined
): ReturnType<typeof formTypesOf>[number] | null {
  return (
    formTypesOf({ types: catalogueTypesFor(type, types) }).find(
      (candidate) => candidate.id === type?.id
    ) ?? null
  );
}

/** Converts stored values into inline-editor drafts, resolving inherited fields from `types`. */
export function draftsFromValues(
  type: CatalogueType | null,
  values: readonly FactValueInput[],
  world: PlacementWorld,
  types: readonly CatalogueType[] = type === null ? [] : [type]
): FieldDrafts {
  const text: Record<string, readonly string[]> = {};
  const refs: Record<string, readonly ReferenceChoice[]> = {};
  const booleans: Record<string, boolean> = {};
  const byField = new Map(values.map((value) => [value.fieldId, value] as const));
  const formType = formTypeFor(type, types);

  for (const field of formType?.fields ?? []) {
    const rawValues = byField.get(field.id)?.values ?? [];
    if (field.kind === 'boolean') {
      const value = rawValues[0];
      if (typeof value === 'boolean') booleans[field.id] = value;
    } else if (field.kind === 'reference') {
      refs[field.id] = rawValues.flatMap((value) =>
        isReferenceValue(value)
          ? [
              {
                id: value.targetId,
                kind: value.targetKind,
                label: referenceLabel(value, world),
              },
            ]
          : []
      );
    } else {
      text[field.id] = rawValues.map(stringValue);
    }
  }

  return { text, refs, booleans };
}
