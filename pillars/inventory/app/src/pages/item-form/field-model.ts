import { ancestorIds, effectiveFields } from '../../lib/type-tree.js';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

/** The editor-facing kinds supported by the item form. */
export type FormFieldKind =
  | 'short_text'
  | 'long_text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'enum'
  | 'measurement'
  | 'date'
  | 'date_time'
  | 'url'
  | 'reference';

/** One option for an enum field. */
export interface FormEnumOption {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly archivedAt: string | null;
}

/** One catalogue field as consumed by the item form. */
export interface FormFieldDef {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly kind: FormFieldKind;
  readonly cardinality: 'one' | 'many';
  readonly required: boolean;
  readonly storage: 'stored' | 'computed';
  readonly allowOverride: boolean;
  readonly help: string | null;
  readonly fixedUnit: string | null;
  readonly enumOptions: readonly FormEnumOption[];
  readonly referenceKinds: readonly ('item' | 'location')[];
  readonly referenceTypeIds: readonly string[];
  readonly expression: unknown;
}

/** One published type as displayed by the form. */
export interface FormTypeDef {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly description: string | null;
  /** The published parent id, when this type belongs below another type. */
  readonly parentTypeId?: string | null;
  readonly containment: boolean;
  readonly fields: readonly FormFieldDef[];
}

/** A selected item or location reference. */
export interface ReferenceChoice {
  readonly id: string;
  readonly kind: 'item' | 'location';
  readonly label: string;
  readonly typeId?: string | null;
  readonly typeName?: string | null;
}

/** Draft field values grouped by their storage shape. */
export interface FieldDrafts {
  readonly text: Readonly<Record<string, readonly string[]>>;
  readonly refs: Readonly<Record<string, readonly ReferenceChoice[]>>;
  readonly booleans: Readonly<Record<string, boolean>>;
}

/** Empty values used by a newly opened form. */
export const EMPTY_DRAFTS: FieldDrafts = {
  text: {},
  refs: {},
  booleans: {},
};

function effectiveCapabilitiesFor(types: readonly CatalogueType[], id: string): readonly string[] {
  const typeById = new Map(types.map((type) => [type.id, type]));
  const path = [...ancestorIds(types, id), id];
  return [...new Set(path.flatMap((typeId) => typeById.get(typeId)?.capabilities ?? []))];
}

/** Converts published types into form definitions with root-first effective fields and capabilities. */
export function formTypesOf(
  catalogue: { readonly types: readonly CatalogueType[] } | undefined
): FormTypeDef[] {
  const allTypes = catalogue?.types ?? [];
  const activeTypes = allTypes.filter((type) => type.archivedAt === null);
  return activeTypes
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((type) => ({
      id: type.id,
      key: type.key,
      label: type.label,
      description: type.description,
      parentTypeId: type.parentTypeId,
      containment: effectiveCapabilitiesFor(allTypes, type.id).includes('containment'),
      fields: effectiveFields(allTypes, type.id)
        .filter((field) => field.archivedAt === null)
        .map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          kind: field.kind,
          cardinality: field.cardinality,
          required: field.required,
          storage: field.storage,
          allowOverride: field.allowOverride,
          help: field.help,
          fixedUnit: field.fixedUnit,
          enumOptions: field.enumOptions,
          referenceKinds: field.referenceKinds,
          referenceTypeIds: field.referenceTypeIds,
          expression: field.expression,
        })),
    }));
}

/** Counts non-empty values in one field draft. */
export function valueCount(drafts: FieldDrafts, field: FormFieldDef): number {
  if (field.kind === 'boolean') return drafts.booleans[field.id] === undefined ? 0 : 1;
  if (field.kind === 'reference') return drafts.refs[field.id]?.length ?? 0;
  return (drafts.text[field.id] ?? []).filter((value) => value.trim() !== '').length;
}

/** Returns whether a field accepts more than one value. */
export function allowsMany(field: FormFieldDef): boolean {
  return field.cardinality === 'many';
}
