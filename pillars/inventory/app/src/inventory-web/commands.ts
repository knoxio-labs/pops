import type { WebItem } from './item-row-model.js';
import type { ItemPatch } from './optimistic-items.js';
import type { CatalogueDescriptor } from './useCatalogueLookups.js';

/**
 * The typed shape of every command the sync mutation protocol accepts
 * (Inventory ADR-002), as the web app is allowed to send them.
 *
 * The wire body types the mutation batch generically (`args: unknown`) --
 * the discriminated union here is this app's own contract with itself, kept
 * in step with `pillars/inventory/contracts/command-vectors-v1.json`
 * (the source of truth the pillar's own command tests generate it from) by
 * `mutation-client.test.ts`, which builds one envelope per op and checks its
 * `op`/`args` pair against a vector fixture.
 */

/** Where an item is, or is going: a place, inside another item, or in hand. */
export type InventoryPlacementTarget =
  | { kind: 'location'; locationId: string }
  | { kind: 'container'; itemId: string }
  | { kind: 'hand' };

interface NewItemInput {
  name: string;
  placement: InventoryPlacementTarget;
  typeKey?: string;
  fields?: Record<string, unknown>;
  note?: string;
  quantity?: number;
}

interface NewLocationInput {
  name: string;
  parentId: string | null;
}

/** One primitive value in the stable catalogue-value wire format. */
export type FieldWireValue =
  | string
  | number
  | boolean
  | { optionId: string }
  | { amount: string; unit: string }
  | { targetKind: 'item' | 'location'; targetId: string };

/** One stable field patch; `null` clears an optional stored value. */
export interface FieldValuePatch {
  fieldId: string;
  values: readonly FieldWireValue[] | null;
}

/** One complete stable field value used when changing an item's type. */
export interface FieldValueEntry {
  fieldId: string;
  values: readonly FieldWireValue[];
}

/** The protocol-2 arguments for a stable type replacement. */
export interface StableChangeTypeArgs {
  typeId: string;
  values: readonly FieldValueEntry[];
}

type ItemEditInput = Partial<Pick<NewItemInput, 'name' | 'fields' | 'quantity'>> & {
  note?: string | null;
  values?: readonly FieldValuePatch[];
};

/** One command and its arguments, keyed by `op` exactly as the server expects. */
export type InventoryCommand =
  | {
      op: 'item.move';
      args: { to: InventoryPlacementTarget; verb: 'move' | 'store' | 'pick_up' | 'put_back' };
    }
  | { op: 'item.setAccess'; args: { access: 'open' | 'closed' } }
  | { op: 'item.setFull'; args: { full: boolean } }
  | { op: 'item.setLifecycle'; args: { lifecycle: string; reason?: string } }
  | { op: 'item.restoreDeleted'; args: Record<string, never> }
  | { op: 'event.revert'; args: { seq: number } }
  | { op: 'item.create'; args: { item: NewItemInput } }
  | { op: 'item.edit'; args: ItemEditInput }
  | {
      op: 'item.changeType';
      args: { typeKey: string; fields?: Record<string, unknown> } | StableChangeTypeArgs;
    }
  | { op: 'item.setOverride'; args: { fieldId: string; values: readonly [FieldWireValue] } }
  | { op: 'item.clearOverride'; args: { fieldId: string } }
  | { op: 'item.setCode'; args: { code: string | null } }
  | { op: 'item.setQuantity'; args: { quantity: number } }
  | { op: 'item.split'; args: { newItemId: string; quantity: number } }
  | { op: 'item.attachPhoto'; args: { sha256: string; position: number } }
  | { op: 'item.removePhoto'; args: { sha256: string } }
  | { op: 'item.reorderPhotos'; args: { sha256s: string[] } }
  | { op: 'item.delete'; args: Record<string, never> }
  | { op: 'location.create'; args: { location: NewLocationInput } }
  | { op: 'location.rename'; args: { name: string } }
  | { op: 'location.move'; args: { parentId: string | null } }
  | { op: 'location.delete'; args: Record<string, never> };

/** `InventoryCommand['op']`, spelled out so a caller can narrow on it without a value in hand. */
export type InventoryCommandOp = InventoryCommand['op'];

type TypedVerbRun<TResult> = (
  ...input: [string, ItemPatch, InventoryCommand, number]
) => Promise<TResult>;
type OptionalCatalogue = CatalogueDescriptor | undefined;

function requireCatalogueRevision(catalogue: OptionalCatalogue): number {
  const revision = catalogue?.revision.revision;
  if (revision === undefined) throw new Error('the published catalogue is not loaded');
  return revision;
}

function applyFieldValuePatch(
  item: WebItem,
  patch: FieldValuePatch,
  source: 'stored' | 'override',
  catalogueRevision: number
): WebItem {
  const index = item.fieldValues.findIndex(
    (entry) => entry.fieldId === patch.fieldId && entry.source === source
  );
  if (patch.values === null) {
    if (index === -1) return item;
    return {
      ...item,
      fieldValues: item.fieldValues.filter(
        (entry) => entry.fieldId !== patch.fieldId || entry.source !== source
      ),
    };
  }
  const nextEntry = {
    catalogueRevision,
    fieldId: patch.fieldId,
    source,
    values: [...patch.values],
  };
  const fieldValues =
    index === -1
      ? [...item.fieldValues, nextEntry]
      : item.fieldValues.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry));
  return { ...item, fieldValues };
}

function storedValuePatch(patches: readonly FieldValuePatch[], revision: number): ItemPatch {
  return (item) =>
    patches.reduce(
      (current, patch) => applyFieldValuePatch(current, patch, 'stored', revision),
      item
    );
}

function overrideValuePatch(
  fieldId: string,
  values: readonly FieldWireValue[] | null,
  revision: number
): ItemPatch {
  return (item) => applyFieldValuePatch(item, { fieldId, values }, 'override', revision);
}

/** Creates the protocol-2 single-item verbs that depend on a published catalogue. */
export function createTypedItemVerbs<TResult>(
  run: TypedVerbRun<TResult>,
  catalogue: OptionalCatalogue
) {
  const editValues = async (id: string, patches: readonly FieldValuePatch[]): Promise<TResult> => {
    if (patches.length === 0) throw new Error('item.edit requires at least one field patch');
    const revision = requireCatalogueRevision(catalogue);
    return run(
      id,
      storedValuePatch(patches, revision),
      { op: 'item.edit', args: { values: patches } },
      revision
    );
  };
  const changeType = async (
    id: string,
    typeReference: string,
    values?: readonly FieldValueEntry[]
  ): Promise<TResult> => {
    const revision = requireCatalogueRevision(catalogue);
    const type = catalogue?.types.find(
      (candidate) => candidate.key === typeReference || candidate.id === typeReference
    );
    if (type === undefined) throw new Error(`unknown type ${typeReference}`);
    return run(
      id,
      (item) => item,
      { op: 'item.changeType', args: { typeId: type.id, values: values ?? [] } },
      revision
    );
  };
  const setOverride = async (
    id: string,
    fieldId: string,
    value: FieldWireValue
  ): Promise<TResult> => {
    const revision = requireCatalogueRevision(catalogue);
    return run(
      id,
      overrideValuePatch(fieldId, [value], revision),
      { op: 'item.setOverride', args: { fieldId, values: [value] } },
      revision
    );
  };
  const clearOverride = async (id: string, fieldId: string): Promise<TResult> => {
    const revision = requireCatalogueRevision(catalogue);
    return run(
      id,
      overrideValuePatch(fieldId, null, revision),
      { op: 'item.clearOverride', args: { fieldId } },
      revision
    );
  };
  return { editValues, changeType, setOverride, clearOverride };
}
