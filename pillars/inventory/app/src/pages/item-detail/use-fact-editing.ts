import { useItemVerbs, usePendingItemIds } from '../../inventory-web/item-verbs';
import { useCatalogueLookups, type CatalogueType } from '../../inventory-web/useCatalogueLookups';
import { formTypesOf, type FieldDrafts, type FormFieldDef } from '../item-form/field-model';
import { useFactEditingState } from './fact-editing-state';
import { draftsFromValues } from './fact-editing-values';

import type { ItemRowModel, PlacementWorld } from '../../foundation/model';

/** A stored catalogue field value as returned by the web item detail read. */
export interface FactValueSnapshot {
  fieldId: string;
  source: 'stored' | 'override';
  values: readonly unknown[];
}

/** The detail data required to edit one item's stored catalogue facts. */
export interface FactEditingModel {
  item: Pick<ItemRowModel, 'id' | 'typeId'>;
  aggregate: {
    type: CatalogueType | null;
    fieldValues: readonly FactValueSnapshot[];
  } | null;
  relatedWorld: PlacementWorld;
}

/** The visible phase of a single inline fact editor. */
export type FactPhase = 'idle' | 'editing' | 'saving' | 'pending' | 'rejected';

/** State and operations for one-at-a-time inline fact editing. */
export interface FactEditing {
  phaseOf: (key: string) => FactPhase;
  drafts: FieldDrafts;
  rejection: { key: string; reason: string } | null;
  problem: string | null;
  /** Finds a current stored field by its stable catalogue key, never by display id. */
  fieldOf: (key: string) => FormFieldDef | null;
  /** The related item/location world used to name reference chips. */
  world: PlacementWorld;
  /** Returns a type label and falls back when the catalogue no longer knows the type. */
  typeLabel: (typeId: string) => string;
  start: (key: string) => void;
  change: (drafts: FieldDrafts) => void;
  save: () => void;
  revert: () => void;
}

/** Provides validated, optimistic, one-fact-at-a-time editing for an item detail model. */
export function useFactEditing(model: FactEditingModel): FactEditing {
  const catalogue = useCatalogueLookups();
  const itemVerbs = useItemVerbs();
  const pendingItemIds = usePendingItemIds();
  const type = model.aggregate?.type ?? null;
  const formType = type === null ? null : (formTypesOf({ types: [type] })[0] ?? null);
  const initialDrafts = draftsFromValues(
    type,
    model.aggregate?.fieldValues ?? [],
    model.relatedWorld
  );
  const state = useFactEditingState({
    itemId: model.item.id,
    fields: formType?.fields ?? [],
    initialDrafts,
    pendingItemIds,
    editValues: (patches) => itemVerbs.editValues(model.item.id, patches),
  });
  const typeLabel = (typeId: string): string =>
    catalogue.typeNameForId(typeId) ?? (type?.id === typeId ? type.label : null) ?? 'Unknown type';

  return { ...state, world: model.relatedWorld, typeLabel };
}
