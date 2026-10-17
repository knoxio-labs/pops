import { Checkbox, ComboboxSelect, Input, Textarea } from '@pops/ui';

import { fieldInputProps, fieldInputValue } from '../../pages/item-form/field-input-props';
import { blankDraft } from '../../pages/item-form/form-draft';
import { ReferenceField } from '../../pages/item-form/reference-field';
import { bulkFieldInputError, type BulkFieldInput } from './bulk-action-model.js';
import { bulkFormField } from './bulk-field-definition.js';
import { isBulkReferenceInput } from './bulk-reference-model.js';

import type { ReactElement } from 'react';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { DraftAction } from '../../pages/item-form/form-draft';

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
  const formField = bulkFormField(field);
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

function stringControlValue(value: BulkFieldInput): string | string[] {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  return strings.length === value.length ? strings : '';
}

function BulkTextFieldInputControl({
  field,
  value,
  onChange,
}: {
  field: CatalogueType['fields'][number];
  value: BulkFieldInput;
  onChange: (value: BulkFieldInput) => void;
}): ReactElement {
  const errorId = useId();
  const error = bulkFieldInputError(field, value);
  const inputProps = {
    'aria-label': field.label,
    'aria-invalid': error !== null || undefined,
    'aria-describedby': error === null ? undefined : errorId,
    value: fieldInputValue(field.kind, typeof value === 'string' ? value : ''),
  };
  return (
    <div className="grid gap-1.5">
      {field.kind === 'long_text' ? (
        <Textarea {...inputProps} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input
          {...inputProps}
          {...fieldInputProps(field.kind)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error === null ? null : (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
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
  return <BulkTextFieldInputControl field={field} value={value} onChange={onChange} />;
}
import { useId } from 'react';
