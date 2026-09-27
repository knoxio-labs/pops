import { formTypesOf } from './field-model';
import {
  fieldDraftsFromProtocolFields,
  fieldDraftsFromStableValues,
  textValueForField,
} from './field-opening';
import { blankDraft } from './form-draft';

import type { Placement, ItemRowModel } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { WebGetResponses } from '../../inventory-api/types.gen.js';
import type { CatalogueDescriptor } from '../../inventory-web/useCatalogueLookups.js';
import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';

type WebItem = WebGetResponses[200]['item'];

/** A computed value shown beside a catalogue field. */
export interface ComputedDisplay {
  readonly state: 'ok' | 'overridden' | 'unavailable';
  readonly values: readonly unknown[];
  readonly reason: string | null;
  readonly missingInputs: readonly string[];
}

/** The data required to mount one item-form session. */
export interface ItemFormOpening {
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly editing: { readonly id: string; readonly name: string } | null;
  readonly revision: number | null;
  readonly computed: Readonly<Record<string, ComputedDisplay>>;
}

function placementFromWeb(item: WebItem): Placement {
  if (item.placement.kind === 'hand') return { kind: 'in-hand' };
  if (item.placement.kind === 'container')
    return { kind: 'container', containerId: item.placement.itemId };
  return { kind: 'location', locationId: item.placement.locationId };
}

export { fieldDraftsFromProtocolFields, fieldDraftsFromStableValues } from './field-opening';

function fieldValuesFromItem(
  item: WebItem,
  type: FormTypeDef | null,
  world: PlacementWorld
): ItemDraft['fields'] {
  const stored = item.fieldValues.filter((value) => value.source === 'stored');
  return stored.length > 0
    ? fieldDraftsFromStableValues(stored, type, world)
    : fieldDraftsFromProtocolFields(item.fields, type, world);
}

function overridesFromItem(
  item: WebItem,
  type: FormTypeDef | null
): Readonly<Record<string, string>> {
  const overrides: Record<string, string> = {};
  const fields = new Map((type?.fields ?? []).map((field) => [field.id, field] as const));
  for (const value of item.fieldValues) {
    if (value.source === 'override') {
      const first = value.values[0];
      const field = fields.get(value.fieldId);
      if (first !== undefined && field !== undefined) {
        overrides[value.fieldId] = textValueForField(field, first);
      }
    }
  }
  return overrides;
}

function draftFromItem(
  item: WebItem,
  types: readonly FormTypeDef[],
  world: PlacementWorld
): ItemDraft {
  const type = types.find((candidate) => candidate.id === item.typeId) ?? null;
  return {
    mode: 'edit',
    name: item.name,
    typeId: item.typeId,
    quantity: String(item.quantity),
    placement: placementFromWeb(item),
    note: item.note ?? '',
    fields: fieldValuesFromItem(item, type, world),
    code: {
      value: item.code ?? '',
      status: item.code === null ? 'idle' : 'free',
      offered: null,
      freeCode: item.code,
      takenBy: null,
    },
    overrides: overridesFromItem(item, type),
    submitted: false,
  };
}

function computedFromItem(item: WebItem): Readonly<Record<string, ComputedDisplay>> {
  return Object.fromEntries(
    item.computedValues.map((value) => [
      value.fieldId,
      value.state === 'unavailable'
        ? {
            state: 'unavailable',
            values: [],
            reason: value.reason,
            missingInputs: value.missingInputs.map((input) => input.fieldId),
          }
        : {
            state: value.state,
            values: value.values,
            reason: null,
            missingInputs: [],
          },
    ])
  );
}

/** Opens a blank create form, using the `in` query parameter as its destination. */
export function createOpening(
  searchParams: URLSearchParams,
  world: PlacementWorld,
  catalogue: CatalogueDescriptor | undefined
): ItemFormOpening {
  const typeKey = searchParams.get('type');
  const typeId = formTypesOf(catalogue).find((type) => type.key === typeKey)?.id ?? null;
  const destination = searchParams.get('in');
  let placement: Placement = { kind: 'in-hand' };
  if (destination !== null && world.locations.has(destination))
    placement = { kind: 'location', locationId: destination };
  else if (destination !== null && world.items.has(destination))
    placement = { kind: 'container', containerId: destination };
  const draft = blankDraft(placement, typeId);
  return { draft, initial: draft, editing: null, revision: null, computed: {} };
}

/** Opens an edit form and resolves stored reference labels through the supplied placement world. */
export function editOpening(
  item: WebItem,
  catalogue: CatalogueDescriptor | undefined,
  world: PlacementWorld
): ItemFormOpening {
  const types = formTypesOf(catalogue);
  const draft = draftFromItem(item, types, world);
  return {
    draft,
    initial: draft,
    editing: { id: item.id, name: item.name },
    revision: item.revision,
    computed: computedFromItem(item),
  };
}

/** Returns the row model used when the form needs to put its draft in a picker world. */
export function draftRow(draft: ItemDraft, type: FormTypeDef | null): ItemRowModel {
  return {
    id: 'draft-item',
    name: draft.name || 'New item',
    typeId: draft.typeId,
    typeName: type?.label ?? null,
    code: draft.code.value || null,
    quantity: Number(draft.quantity) || 1,
    container: type?.containment === true ? { access: 'open', full: false } : null,
    lifecycle: 'active',
    placement: draft.placement,
    previous: null,
    sync: 'queued',
    photoUrl: null,
    note: draft.note || null,
    updatedAt: new Date(0).toISOString(),
  };
}
