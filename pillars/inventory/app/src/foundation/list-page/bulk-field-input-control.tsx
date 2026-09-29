import { Checkbox, ComboboxSelect, Input, Textarea } from '@pops/ui';

import { decimalPlacesFromPresentation } from '../../catalogue-editor/decimal-places';
import { blankDraft } from '../../pages/item-form/form-draft';
import { ReferenceField } from '../../pages/item-form/reference-field';
import { type BulkFieldInput } from './bulk-action-model.js';
import { isBulkReferenceInput } from './bulk-reference-model.js';

import type { ReactElement } from 'react';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { FormFieldDef } from '../../pages/item-form/field-model';
import type { DraftAction } from '../../pages/item-form/form-draft';

function formFieldOf(field: CatalogueType['fields'][number]): FormFieldDef {
  return {
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
    decimalPlaces: decimalPlacesFromPresentation(field.presentation),
    enumOptions: field.enumOptions,
    referenceKinds: field.referenceKinds,
    referenceTypeIds: field.referenceTypeIds,
    expression: field.expression,
  };
}

function referenceDraft(
  field: CatalogueType['fields'][number],
  value: BulkFieldInput
): ReturnType<typeof blankDraft> {
  const draft = blankDraft();
  return {
    ...draft,
    fields: {
      ...draft.fields,
      refs: { [field.id]: isBulkReferenceInput(value) ? value : [] },
    },
  };
}

function BulkReferenceFieldInputControl({
  field,
  value,
  onChange,
}: {
  field: CatalogueType['fields'][number];
  value: BulkFieldInput;
  onChange: (value: BulkFieldInput) => void;
}): ReactElement {
  const formField = formFieldOf(field);
  const draft = referenceDraft(field, value);
  const dispatch = (action: DraftAction): void => {
    if (action.type === 'field-refs' && action.fieldId === field.id) onChange(action.refs);
  };
  return (
    <ReferenceField
      field={formField}
      draft={draft}
      dispatch={dispatch}
      onReferenceQuery={() => undefined}
    />
  );
}

function textInputType(
  field: CatalogueType['fields'][number]
): 'text' | 'number' | 'date' | 'datetime-local' | 'url' {
  if (field.kind === 'integer' || field.kind === 'decimal' || field.kind === 'measurement') {
    return 'number';
  }
  if (field.kind === 'date') return 'date';
  if (field.kind === 'date_time') return 'datetime-local';
  if (field.kind === 'url') return 'url';
  return 'text';
}

function stringControlValue(value: BulkFieldInput): string | string[] {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  return strings.length === value.length ? strings : '';
}

/** Renders the catalogue-specific control for a bulk field value. */
export function BulkFieldInputControl({
  field,
  value,
  onChange,
}: {
  field: CatalogueType['fields'][number];
  value: BulkFieldInput;
  onChange: (value: BulkFieldInput) => void;
}): ReactElement {
  if (field.kind === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-3">
        <Checkbox
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <span className="text-sm">Yes</span>
      </label>
    );
  }
  if (field.kind === 'reference') {
    return <BulkReferenceFieldInputControl field={field} value={value} onChange={onChange} />;
  }
  if (field.kind === 'enum') {
    return (
      <ComboboxSelect
        aria-label={field.label}
        options={field.enumOptions
          .filter((option) => option.archivedAt === null)
          .map((option) => ({ value: option.id, label: option.label }))}
        value={stringControlValue(value)}
        multiple={field.cardinality === 'many'}
        onChange={onChange}
        placeholder="Choose an option"
        searchPlaceholder={`Search ${field.label.toLocaleLowerCase()}`}
        emptyMessage="No matching options"
      />
    );
  }
  if (field.kind === 'long_text') {
    return (
      <Textarea
        aria-label={field.label}
        value={typeof value === 'string' ? value : ''}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      aria-label={field.label}
      type={textInputType(field)}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
