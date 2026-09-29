import { formatWireValue } from '../../catalogue-editor/computed/preview-model';
import { decimalPlacesFromPresentation } from '../../catalogue-editor/decimal-places';

import type { CatalogueField } from '../../catalogue-editor/types';
import type { PlacementWorld } from '../model/placement-model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function referenceValue(value: Record<string, unknown>, world: PlacementWorld): string | null {
  if (value.targetKind === 'item' && typeof value.targetId === 'string') {
    return world.items.get(value.targetId)?.name ?? 'Unknown item';
  }
  if (value.targetKind === 'location' && typeof value.targetId === 'string') {
    return world.locations.get(value.targetId)?.name ?? 'Unknown place';
  }
  return null;
}

function enumValue(value: Record<string, unknown>, field: CatalogueField): string | null {
  if (typeof value.optionId !== 'string') return null;
  return (
    field.enumOptions.find((option) => option.id === value.optionId)?.label ?? 'Unknown option'
  );
}

function formatValue(value: unknown, field: CatalogueField, world: PlacementWorld): string {
  if (isRecord(value)) {
    const reference = referenceValue(value, world);
    if (reference !== null) return reference;
    if (field.kind === 'enum') {
      const option = enumValue(value, field);
      if (option !== null) return option;
    }
  }
  return formatWireValue(value, {
    kind: field.kind,
    decimalPlaces: decimalPlacesFromPresentation(field.presentation) ?? undefined,
  });
}

/** Formats one catalogue field's wire values as one display line. */
export function formatFactValue(
  values: readonly unknown[],
  field: CatalogueField,
  world: PlacementWorld
): string | null {
  if (values.length === 0) return null;
  return values.map((value) => formatValue(value, field, world)).join(', ');
}
