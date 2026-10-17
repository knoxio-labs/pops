import { useState } from 'react';

import { Button, Input, Textarea } from '@pops/ui';

import { fieldInputProps, fieldInputValue } from './field-input-props';

import type { ReactElement } from 'react';

import type { FormFieldDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';

interface TextFieldEditorProps {
  readonly field: FormFieldDef;
  readonly draft: ItemDraft;
  readonly error?: string;
  readonly dispatch: (action: DraftAction) => void;
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
  onRemove,
}: {
  readonly field: FormFieldDef;
  readonly value: string;
  readonly index: number;
  readonly values: readonly string[];
  readonly error?: string;
  readonly dispatch: TextFieldEditorProps['dispatch'];
  readonly onRemove: () => void;
}): ReactElement {
  const onChange = (nextValue: string): void =>
    setText({ dispatch, field, valueIndex: index, value: nextValue, current: values });
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
            {...fieldInputProps(field.kind)}
            value={fieldInputValue(field.kind, value)}
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
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
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
  const [keys, setKeys] = useState(() => values.map(() => crypto.randomUUID()));
  if (keys.length !== values.length) {
    setKeys(values.map((_, index) => keys[index] ?? crypto.randomUUID()));
  }
  const removeValue = (index: number): void => {
    setKeys(keys.filter((_, keyIndex) => keyIndex !== index));
    dispatch({
      type: 'field-text',
      fieldId: field.id,
      values: values.filter((_, valueIndex) => valueIndex !== index),
    });
  };
  return (
    <div className="space-y-2">
      {keys.map((key, index) => (
        <TextValue
          key={key}
          field={field}
          value={values[index] ?? ''}
          index={index}
          values={values}
          error={error}
          dispatch={dispatch}
          onRemove={() => removeValue(index)}
        />
      ))}
      {field.cardinality === 'many' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setKeys([...keys, crypto.randomUUID()]);
            dispatch({ type: 'field-text', fieldId: field.id, values: [...values, ''] });
          }}
        >
          Add value
        </Button>
      ) : null}
    </div>
  );
}
