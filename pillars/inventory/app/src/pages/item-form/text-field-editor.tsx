import { Button, Input, Textarea } from '@pops/ui';

import type { ReactElement } from 'react';

import type { FormFieldDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';

interface TextFieldEditorProps {
  readonly field: FormFieldDef;
  readonly draft: ItemDraft;
  readonly error?: string;
  readonly dispatch: (action: DraftAction) => void;
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

function keyedTextValues(
  fieldId: string,
  values: readonly string[]
): readonly { readonly key: string; readonly index: number; readonly value: string }[] {
  const occurrences = new Map<string, number>();
  return values.map((value, index) => {
    const occurrence = (occurrences.get(value) ?? 0) + 1;
    occurrences.set(value, occurrence);
    return { key: `${fieldId}-${value}-${occurrence}`, index, value };
  });
}

function setText({
  dispatch,
  field,
  valueIndex,
  value,
  current,
}: {
  dispatch: TextFieldEditorProps['dispatch'];
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
  error,
  dispatch,
}: {
  readonly field: FormFieldDef;
  readonly value: string;
  readonly index: number;
  readonly values: readonly string[];
  readonly error?: string;
  readonly dispatch: TextFieldEditorProps['dispatch'];
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
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {field.kind === 'long_text' ? (
          <Textarea
            id={index === 0 ? `field-${field.id}` : undefined}
            value={value}
            rows={2}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
            aria-invalid={error !== undefined}
            aria-describedby={error === undefined ? undefined : `field-error-${field.id}`}
          />
        ) : (
          <Input
            id={index === 0 ? `field-${field.id}` : undefined}
            type={inputType(field)}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
            aria-invalid={error !== undefined}
            aria-describedby={error === undefined ? undefined : `field-error-${field.id}`}
          />
        )}
        {field.kind === 'measurement' && field.fixedUnit !== null ? (
          <span className="pt-2 text-sm text-muted-foreground">{field.fixedUnit}</span>
        ) : null}
      </div>
      {field.cardinality === 'many' && values.length > 1 ? (
        <Button type="button" variant="ghost" size="sm" onClick={remove}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}

/** Renders text-like catalogue fields, including repeated values. */
export function TextFieldEditor({
  field,
  draft,
  error,
  dispatch,
}: TextFieldEditorProps): ReactElement {
  const values = textValues(draft, field);
  const keyedValues = keyedTextValues(field.id, values);
  return (
    <div className="space-y-2">
      {keyedValues.map(({ key, value, index }) => (
        <TextValue
          key={key}
          field={field}
          value={value}
          index={index}
          values={values}
          error={error}
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
