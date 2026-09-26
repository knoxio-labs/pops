import { formTypesOf } from './field-model';
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
  readonly computed: Readonly<Record<string, ComputedDisplay>>;
}

function placementFromWeb(item: WebItem): Placement {
  if (item.placement.kind === 'hand') return { kind: 'in-hand' };
  if (item.placement.kind === 'container')
    return { kind: 'container', containerId: item.placement.itemId };
  return { kind: 'location', locationId: item.placement.locationId };
}

function fieldValueFor(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

function rawValues(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function fieldValuesFromItem(item: WebItem, type: FormTypeDef | null): ItemDraft['fields'] {
  const text: Record<string, readonly string[]> = {};
  const refs: Record<string, readonly { id: string; kind: 'item' | 'location'; label: string }[]> =
    {};
  const booleans: Record<string, boolean> = {};
  for (const field of type?.fields ?? []) {
    const raw = item.fields[field.id];
    const values = rawValues(raw);
    if (field.kind === 'boolean') {
      const value = values[0];
      if (typeof value === 'boolean') booleans[field.id] = value;
    } else if (field.kind === 'reference') {
      refs[field.id] = values.flatMap((value) =>
        typeof value === 'string'
          ? [{ id: value, kind: field.referenceKinds[0] ?? 'item', label: value }]
          : []
      );
    } else {
      text[field.id] = values.map(fieldValueFor);
    }
  }
  return { text, refs, booleans };
}

function overridesFromItem(item: WebItem): Readonly<Record<string, string>> {
  const overrides: Record<string, string> = {};
  for (const value of item.fieldValues) {
    if (value.source === 'override') {
      const first = value.values[0];
      if (first !== undefined) overrides[value.fieldId] = fieldValueFor(first);
    }
  }
  return overrides;
}

function draftFromItem(item: WebItem, types: readonly FormTypeDef[]): ItemDraft {
  const type = types.find((candidate) => candidate.id === item.typeId) ?? null;
  return {
    mode: 'edit',
    name: item.name,
    typeId: item.typeId,
    quantity: String(item.quantity),
    placement: placementFromWeb(item),
    note: item.note ?? '',
    fields: fieldValuesFromItem(item, type),
    code: {
      value: item.code ?? '',
      status: item.code === null ? 'idle' : 'free',
      offered: null,
      freeCode: item.code,
      takenBy: null,
    },
    overrides: overridesFromItem(item),
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
  return { draft, initial: draft, editing: null, computed: {} };
}

/** Opens an edit form from the current web item response. */
export function editOpening(
  item: WebItem,
  catalogue: CatalogueDescriptor | undefined
): ItemFormOpening {
  const types = formTypesOf(catalogue);
  const draft = draftFromItem(item, types);
  return {
    draft,
    initial: draft,
    editing: { id: item.id, name: item.name },
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
