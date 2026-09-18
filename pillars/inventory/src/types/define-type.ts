/**
 * Types are code, not data: `defineType` is the only place an inventory type
 * is declared (ADR-002 D5). It validates the declaration's internal
 * consistency (a `choice` field has choices, a `measurement`/`range` field
 * has a dimension its unit belongs to, every other kind carries neither) and
 * derives the zod schema an item's `fields` blob is checked against.
 */
import { z } from 'zod';

import { unitBySymbol, type Dimension } from './units.js';
import { fieldValueSchema, type FieldKind } from './values.js';

/** One field a type declares. */
export interface FieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKind;
  /** Short help text shown next to the field in a form. */
  readonly hint?: string;
  /** The closed set of values a `choice` field accepts. Required, non-empty, for `kind: 'choice'`; forbidden otherwise. */
  readonly choices?: readonly string[];
  /** The physical quantity a `measurement`/`range` field carries. Required for those kinds; forbidden otherwise. */
  readonly dimension?: Dimension;
  /** The unit a value is shown in by default; must belong to `dimension`. Required for `measurement`/`range`; forbidden otherwise. */
  readonly unit?: string;
  /** Whether the approved item page shows this field above the fold. */
  readonly highlighted?: boolean;
  /** Whether the command layer rejects an item of this type with no value for this field. Defaults to `false`. */
  readonly required?: boolean;
}

/** The capabilities a type can grant an item. Containment is the only one A1 defines. */
export const TYPE_CAPABILITIES = ['containment'] as const;

export type TypeCapability = (typeof TYPE_CAPABILITIES)[number];

/** A type as declared by `defineType`, before it is projected into a served descriptor. */
export interface TypeDefinition {
  readonly key: string;
  readonly name: string;
  readonly capabilities: readonly TypeCapability[];
  readonly fields: readonly FieldDefinition[];
  /**
   * Free-text `home_inventory.type` values (pre-migration) this type
   * replaces. Compared against `items.legacy_type` for the "type arrived"
   * sheet's match (POPS-4016); has no bearing on validation.
   */
  readonly legacyLabels: readonly string[];
}

export interface DefineTypeInput {
  readonly key: string;
  readonly name: string;
  readonly capabilities?: readonly TypeCapability[];
  readonly fields: readonly FieldDefinition[];
  readonly legacyLabels?: readonly string[];
}

/** Thrown by `defineType` when a declaration is internally inconsistent. */
export class TypeDefinitionError extends Error {
  constructor(
    public readonly typeKey: string,
    message: string
  ) {
    super(`type "${typeKey}": ${message}`);
    this.name = 'TypeDefinitionError';
  }
}

function assertUniqueKey(typeKey: string, field: FieldDefinition, seenKeys: Set<string>): void {
  if (field.key.trim().length === 0) {
    throw new TypeDefinitionError(typeKey, 'a field key must not be empty');
  }
  const normalizedKey = field.key.trim().toLowerCase();
  if (seenKeys.has(normalizedKey)) {
    throw new TypeDefinitionError(typeKey, `field key "${field.key}" is declared more than once`);
  }
  seenKeys.add(normalizedKey);
}

function assertChoiceShape(typeKey: string, field: FieldDefinition): void {
  if (field.kind !== 'choice') {
    if (field.choices !== undefined) {
      throw new TypeDefinitionError(
        typeKey,
        `field "${field.key}" is not a "choice" field and must not declare \`choices\``
      );
    }
    return;
  }
  if (!field.choices || field.choices.length === 0) {
    throw new TypeDefinitionError(
      typeKey,
      `field "${field.key}" is a "choice" field and needs a non-empty \`choices\` list`
    );
  }
  if (new Set(field.choices).size !== field.choices.length) {
    throw new TypeDefinitionError(typeKey, `field "${field.key}" declares a duplicate choice`);
  }
}

function assertUnitShape(typeKey: string, field: FieldDefinition): void {
  if (field.kind !== 'measurement' && field.kind !== 'range') {
    if (field.dimension !== undefined || field.unit !== undefined) {
      throw new TypeDefinitionError(
        typeKey,
        `field "${field.key}" is not a "measurement" or "range" field and must not declare \`dimension\` or \`unit\``
      );
    }
    return;
  }
  if (!field.dimension) {
    throw new TypeDefinitionError(typeKey, `field "${field.key}" needs a \`dimension\``);
  }
  if (!field.unit) {
    throw new TypeDefinitionError(typeKey, `field "${field.key}" needs a default \`unit\``);
  }
  const unit = unitBySymbol(field.unit);
  if (!unit) {
    throw new TypeDefinitionError(
      typeKey,
      `field "${field.key}" declares unknown unit "${field.unit}"`
    );
  }
  if (unit.dimension !== field.dimension) {
    throw new TypeDefinitionError(
      typeKey,
      `field "${field.key}" declares unit "${field.unit}" (${unit.dimension}), which does not belong to dimension "${field.dimension}"`
    );
  }
}

function assertField(typeKey: string, field: FieldDefinition, seenKeys: Set<string>): void {
  assertUniqueKey(typeKey, field, seenKeys);
  assertChoiceShape(typeKey, field);
  assertUnitShape(typeKey, field);
}

/**
 * Declares one inventory type: its key, its display name, the capabilities
 * it grants an item, and its fields. Validates the declaration and returns
 * it unchanged; the only way to get a `TypeDefinition` is through here, so a
 * malformed field fails at import time rather than at first use.
 */
export function defineType(input: DefineTypeInput): TypeDefinition {
  if (input.key.trim().length === 0) {
    throw new TypeDefinitionError(input.key, 'a type key must not be empty');
  }
  const seenKeys = new Set<string>();
  for (const field of input.fields) {
    assertField(input.key, field, seenKeys);
  }
  return {
    key: input.key,
    name: input.name,
    capabilities: input.capabilities ?? [],
    fields: input.fields,
    legacyLabels: input.legacyLabels ?? [],
  };
}

/**
 * The zod schema an item's `fields` JSON blob must satisfy for `type`.
 * Unknown keys are rejected: a field not in the type's declaration is not a
 * value the command layer will accept, per ADR-002 ("validated by the
 * type's zod schema"). A field not marked `required` is optional.
 */
export function typeFieldsSchema(type: TypeDefinition): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of type.fields) {
    const schema = fieldValueSchema(field);
    shape[field.key] = field.required ? schema : schema.optional();
  }
  return z.object(shape).strict();
}
