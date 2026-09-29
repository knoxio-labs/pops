import { formatWireValue } from '../../catalogue-editor/computed/preview-model.js';
import { expressionContext } from '../../catalogue-editor/expression/wire.js';
import { effectiveType, typePathLabel } from '../../lib/type-tree.js';

import type { ExpressionField } from '@pops/inventory/expression';

import type { WebItem } from '../../inventory-web/item-row-model.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { ExportRow } from './inventory-csv.js';

function expressionFieldsFor(
  types: Parameters<typeof expressionContext>[0],
  typeId: string
): ReadonlyMap<string, ExpressionField> | null {
  const type = expressionContext(types, typeId, undefined).types.find(
    (candidate) => candidate.id === typeId
  );
  if (type === undefined) return null;

  const fields = new Map<string, ExpressionField>();
  for (const field of type.fields) fields.set(field.id, field);
  return fields;
}

function fieldValues(
  item: WebItem,
  types: Parameters<typeof expressionContext>[0]
): Record<string, string> {
  if (item.typeId === null) return {};
  const type = effectiveType(types, item.typeId);
  const expressionFields = expressionFieldsFor(types, item.typeId);
  if (type === null || expressionFields === null) return {};

  const fields: Record<string, string> = {};
  for (const field of type.fields) {
    const expressionField = expressionFields.get(field.id);
    if (expressionField === undefined) continue;
    if (field.storage === 'stored') {
      const stored = item.fieldValues.find(
        (entry) => entry.fieldId === field.id && entry.source === 'stored'
      );
      fields[field.label] =
        stored === undefined
          ? ''
          : stored.values.map((value) => formatWireValue(value, expressionField)).join('; ');
      continue;
    }

    const computed = item.computedValues.find((entry) => entry.fieldId === field.id);
    fields[field.label] =
      computed?.state === 'ok' || computed?.state === 'overridden'
        ? formatWireValue(computed.values[0], expressionField)
        : '';
  }
  return fields;
}

function rowWhere(
  item: WebItem,
  rowsById: ReadonlyMap<string, WebItem>,
  containerNames: ReadonlyMap<string, string>,
  world: PlacementWorld
): string {
  if (item.placement.kind === 'hand') return '';
  if (item.placement.kind === 'location')
    return world.locations.get(item.placement.locationId)?.name ?? '';
  return (
    rowsById.get(item.placement.itemId)?.name ??
    containerNames.get(item.placement.itemId) ??
    world.items.get(item.placement.itemId)?.name ??
    ''
  );
}

/** Maps raw web items to CSV rows with direct placement and displayed field values. */
export function toExportRows(input: {
  readonly rows: readonly WebItem[];
  readonly containerNames: ReadonlyMap<string, string>;
  readonly types: Parameters<typeof expressionContext>[0];
  readonly world: PlacementWorld;
}): ExportRow[] {
  const { rows, containerNames, types, world } = input;
  const rowsById = new Map(rows.map((row) => [row.id, row] as const));
  return rows.map((item) => ({
    name: item.name,
    typeLabel: item.typeId === null ? '' : typePathLabel(types, item.typeId),
    quantity: item.quantity,
    code: item.code ?? '',
    where: rowWhere(item, rowsById, containerNames, world),
    note: item.note ?? '',
    fields: fieldValues(item, types),
  }));
}
