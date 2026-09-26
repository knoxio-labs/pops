import { Button, ComboboxSelect, Input, Textarea } from '@pops/ui';

import { ComputedField } from './computed-field';
import { ReferenceField } from './reference-field';

import type { ReactElement } from 'react';

import type { FormFieldDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';
import type { ComputedDisplay } from './form-opening';

/** Inputs shared by every type-specific field editor. */
export interface FieldEditorProps {
  readonly field: FormFieldDef;
  readonly draft: ItemDraft;
  readonly computed: ComputedDisplay | undefined;
  readonly dispatch: (action: DraftAction) => void;
  readonly onReferenceQuery: (query: string) => void;
}

function inputType(field: FormFieldDef): 'text' | 'number' | 'date' | 'datetime-local' | 'url' {
  if (field.kind === 'integer' || field.kind === 'decimal' || field.kind === 'measurement')
    return 'number';
  if (field.kind === 'date') return 'date';
  if (field.kind === 'date_time') return 'datetime-local';
  if (field.kind === 'url') return 'url';
  return 'text';
}

function textValues(draft: ItemDraft, field: FormFieldDef): readonly string[] {
  const values = draft.fields.text[field.id];
  if (values === undefined || values.length === 0) return [''];
  return values;
}

function setText({
  dispatch,
  field,
  valueIndex,
  value,
  current,
}: {
  dispatch: FieldEditorProps['dispatch'];
  field: FormFieldDef;
  valueIndex: number;
  value: string;
  current: readonly string[];
}): void {
  const values = [...current];
  values[valueIndex] = value;
  dispatch({ type: 'field-text', fieldId: field.id, values });
}

function TextValue({
  field,
  value,
  index,
  values,
  dispatch,
}: {
  readonly field: FormFieldDef;
  readonly value: string;
  readonly index: number;
  readonly values: readonly string[];
  readonly dispatch: FieldEditorProps['dispatch'];
}): ReactElement {
  const onChange = (nextValue: string): void =>
    setText({ dispatch, field, valueIndex: index, value: nextValue, current: values });
  const remove = (): void =>
    dispatch({
      type: 'field-text',
      fieldId: field.id,
      values: values.filter((_, valueIndex) => valueIndex !== index),
    });
  const label = `${field.label} ${index + 1}`;
  return (
    <div className="flex gap-2">
      {field.kind === 'long_text' ? (
        <Textarea
          value={value}
          rows={2}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        />
      ) : (
        <Input
          type={inputType(field)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        />
      )}
      {field.cardinality === 'many' && values.length > 1 ? (
        <Button type="button" variant="ghost" size="sm" onClick={remove}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}

function TextEditor({ field, draft, dispatch }: FieldEditorProps): ReactElement {
  const values = textValues(draft, field);
  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <TextValue
          key={`${field.id}-${value}`}
          field={field}
          value={value}
          index={index}
          values={values}
          dispatch={dispatch}
        />
      ))}
      {field.cardinality === 'many' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            dispatch({ type: 'field-text', fieldId: field.id, values: [...values, ''] })
          }
        >
          Add value
        </Button>
      ) : null}
    </div>
  );
}

function EnumEditor({ field, draft, dispatch }: FieldEditorProps): ReactElement {
  const selected = draft.fields.text[field.id] ?? [];
  const selectedValue = field.cardinality === 'many' ? [...selected] : (selected[0] ?? '');
  const setValue = (value: string | string[]): void => {
    if (Array.isArray(value)) {
      dispatch({ type: 'field-text', fieldId: field.id, values: value });
      return;
    }
    dispatch({ type: 'field-text', fieldId: field.id, values: value === '' ? [] : [value] });
  };
  return (
    <ComboboxSelect
      options={field.enumOptions
        .filter((option) => option.archivedAt === null)
        .map((option) => ({ value: option.key, label: option.label }))}
      value={selectedValue}
      multiple={field.cardinality === 'many'}
      onChange={setValue}
      placeholder="Choose an option"
      searchPlaceholder={`Search ${field.label.toLocaleLowerCase()}`}
      aria-label={field.label}
    />
  );
}

/** Renders a stored, reference, enum, boolean or computed form field. */
export function FieldEditor(props: FieldEditorProps): ReactElement {
  const { field } = props;
  if (field.storage === 'computed')
    return (
      <ComputedField
        field={field}
        draft={props.draft}
        computed={props.computed}
        dispatch={props.dispatch}
      />
    );
  if (field.kind === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={props.draft.fields.booleans[field.id] ?? false}
          onChange={(event) =>
            props.dispatch({
              type: 'field-boolean',
              fieldId: field.id,
              value: event.target.checked,
            })
          }
        />{' '}
        <span className="text-sm">Yes</span>
      </label>
    );
  }
  if (field.kind === 'enum') return <EnumEditor {...props} />;
  if (field.kind === 'reference') return <ReferenceField {...props} />;
  return <TextEditor {...props} />;
}
