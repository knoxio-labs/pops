/**
 * What the item form knows about a type's fields: the catalogue definition
 * (kind, cardinality, unit, options, reference targets, computed policy) and
 * the draft values typed against it. Values are kept as the text the person
 * typed, because the form validates text and the API parses it.
 */
import type { CatalogueFieldKind } from '@/fixtures/inventory-type-fields';

/** One option of an enum field. A retired option keeps existing values but cannot be chosen again. */
export interface EnumOption {
  id: string;
  label: string;
  retired?: boolean;
}

/** What a reference field may point at. An empty `typeIds` allows every item type. */
export interface ReferenceTargets {
  kinds: readonly ('item' | 'location')[];
  typeIds: readonly string[];
}

/** A computed field's policy: whether a typed value may replace the result. */
export interface ComputedPolicy {
  allowOverride: boolean;
  /** The fields the expression reads, named for the create-mode row. */
  reads: readonly string[];
}

/** One field of a published type, as the form draws it. */
export interface FormFieldDef {
  id: string;
  label: string;
  kind: CatalogueFieldKind;
  cardinality: 'one' | 'many';
  help?: string;
  /** Measurement only: the fixed unit symbol. */
  unit?: string;
  /** Enum only. */
  options?: readonly EnumOption[];
  /** Reference only. */
  reference?: ReferenceTargets;
  /** Present when the value is calculated rather than stored. */
  computed?: ComputedPolicy;
}

/** One published type the form can pick. */
export interface FormTypeDef {
  id: string;
  label: string;
  parentTypeId: string | null;
  /** A container type: the item holds things and its quantity is always 1. */
  containment: boolean;
  /** The stem the code suggester numbers from. */
  codeStem: string;
  fields: readonly FormFieldDef[];
}

/** A chosen reference target, kept by identity with its name for display. */
export interface ReferenceChoice {
  kind: 'item' | 'location';
  id: string;
  name: string;
}

/** Draft values by field id: typed text for every kind but references. */
export interface FieldDrafts {
  text: Readonly<Record<string, readonly string[]>>;
  refs: Readonly<Record<string, readonly ReferenceChoice[]>>;
}

/** No values at all. */
export const EMPTY_DRAFTS: FieldDrafts = { text: {}, refs: {} };

/** The values a field holds in a draft, text or references, counted alike. */
export function valueCount(drafts: FieldDrafts, field: FormFieldDef): number {
  if (field.kind === 'reference') return drafts.refs[field.id]?.length ?? 0;
  return (drafts.text[field.id] ?? []).filter((value) => value.trim() !== '').length;
}

/** Whether a field can hold several values. Yes / no is always one (ADR-002 D5). */
export function allowsMany(field: FormFieldDef): boolean {
  return field.cardinality === 'many' && field.kind !== 'boolean';
}
