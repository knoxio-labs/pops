import { issue } from './authoring-shared.js';
import { canonicalizeValue } from './value-dispatch.js';
import { ValueValidationError } from './value-types.js';

import type { CatalogueIssue } from './authoring-types.js';
import type { PrimitiveWireValue, ValueFieldDefinition } from './value-types.js';

/** Canonical default values that passed their field's rules, or the issue that refused them. */
export type FieldDefaultValuesCheck =
  | { readonly ok: true; readonly values: readonly PrimitiveWireValue[] }
  | { readonly ok: false; readonly issue: CatalogueIssue };

function refused(
  field: ValueFieldDefinition,
  code: string,
  message: string
): FieldDefaultValuesCheck {
  return { ok: false, issue: issue(field.id, 'defaultValues', code, message) };
}

/**
 * Checks a field's default values against the same value rules an item write
 * passes. Only a stored, non-reference field may hold a default
 * (`default_not_allowed`); a single-value field holds at most one, and each
 * entry must validate (`default_invalid`), except that an archived enum
 * option is reported as `default_enum_option_archived`.
 */
export function checkFieldDefaultValues(
  field: ValueFieldDefinition,
  values: readonly unknown[]
): FieldDefaultValuesCheck {
  if (values.length === 0) return { ok: true, values: [] };
  if (field.storage !== 'stored' || field.kind === 'reference') {
    return refused(
      field,
      'default_not_allowed',
      'Only stored, non-reference fields take a default'
    );
  }
  if (field.cardinality === 'one' && values.length > 1) {
    return refused(field, 'default_invalid', 'A single-value field takes at most one default');
  }
  const canonical: PrimitiveWireValue[] = [];
  for (const value of values) {
    try {
      canonical.push(canonicalizeValue(field, value).value);
    } catch (error) {
      if (!(error instanceof ValueValidationError)) throw error;
      const code =
        error.code === 'enum_option_archived' ? 'default_enum_option_archived' : 'default_invalid';
      return refused(field, code, error.message);
    }
  }
  return { ok: true, values: canonical };
}
