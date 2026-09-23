import { z } from 'zod';

import { CommandRejected } from './errors.js';

import type { ItemFieldValueInput, PersistedItemType } from '../../catalogue/index.js';
import type { FieldValues } from './entities.js';

function valueSource(field: PersistedItemType['fields'][number]): 'stored' | 'override' {
  return field.storage === 'stored' ? 'stored' : 'override';
}

/** Applies event field changes to the matching stored or override authorities. */
export function mergeActiveChanges(
  current: readonly ItemFieldValueInput[],
  changes: FieldValues,
  type: PersistedItemType
): ItemFieldValueInput[] {
  const merged: ItemFieldValueInput[] = current.map((entry) => ({
    ...entry,
    values: [...entry.values],
  }));
  for (const [fieldId, value] of Object.entries(changes)) {
    const field = type.fields.find((candidate) => candidate.id === fieldId);
    if (field === undefined) {
      if (value === null) continue;
      throw new CommandRejected('invalid', `field ${fieldId} is not declared`);
    }
    const source = valueSource(field);
    const index = merged.findIndex((entry) => entry.fieldId === fieldId && entry.source === source);
    if (value === null) {
      if (index >= 0) merged.splice(index, 1);
      continue;
    }
    const values = z.array(z.json()).min(1).parse(value);
    const replacement: ItemFieldValueInput = { fieldId, source, values };
    if (index >= 0) merged[index] = replacement;
    else merged.push(replacement);
  }
  return merged;
}
