import { fieldChoices } from '@pops/inventory/labels';

import { effectiveType, typePathLabel } from '../../lib/type-tree';
import { detailsFor } from './label-details';
import { fieldValueError, labelFieldId } from './label-field-values';

import type { LabelFieldChoice } from '@pops/inventory/labels';

import type { CatalogueType } from '../../catalogue-editor/types';
import type { WebItem } from './label-item';

/** Keeps unavailable catalogue fields selectable while recording their individual failures. */
export function labelFieldState(item: WebItem, types: ReadonlyMap<string, CatalogueType>) {
  const type = item.typeId == null ? null : effectiveType([...types.values()], item.typeId);
  const errors = new Map<string, Error>();
  if (type === null) return { choices: fieldChoices([detailsFor(item, [], types)]), errors };
  const typeName = typePathLabel([...types.values()], type.id) || type.label;
  const choices: LabelFieldChoice[] = type.fields.map((field) => {
    const id = labelFieldId(field, types, item.typeKey ?? type.key);
    const error = fieldValueError(item, field);
    if (error) errors.set(id, error);
    return { id, label: field.label, typeName };
  });
  return { choices, errors };
}
