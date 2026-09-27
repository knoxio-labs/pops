import { Checkbox, ComboboxSelect } from '@pops/ui';

import { ComputedField } from './computed-field';
import { ReferenceField } from './reference-field';
import { TextFieldEditor } from './text-field-editor';

import type { ReactElement } from 'react';

import type { FormFieldDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';
import type { ComputedDisplay } from './form-opening';

/** Inputs shared by every type-specific field editor. */
export interface FieldEditorProps {
  readonly field: FormFieldDef;
  readonly draft: ItemDraft;
  readonly computed: ComputedDisplay | undefined;
  readonly error?: string;
  readonly dispatch: (action: DraftAction) => void;
  readonly onReferenceQuery: (query: string) => void;
}

function EnumEditor({ field, draft, dispatch }: FieldEditorProps): ReactElement {
  const selected = draft.fields.text[field.id] ?? [];
  const selectedValue = field.cardinality === 'many' ? [...selected] : (selected[0] ?? '');
  const declaredOptions = field.enumOptions.map((option) => ({
    value: option.id,
    label: option.archivedAt === null ? option.label : `${option.label} (archived)`,
    disabled: option.archivedAt !== null,
  }));
  const invalidOptions = selected
    .filter((value) => !field.enumOptions.some((option) => option.id === value))
    .map((value) => ({ value, label: `Invalid option (${value})`, disabled: true }));
  const options = [...declaredOptions, ...invalidOptions].filter(
    (option, index, all) => all.findIndex((candidate) => candidate.value === option.value) === index
  );
  const setValue = (value: string | string[]): void => {
    if (Array.isArray(value)) {
      dispatch({ type: 'field-text', fieldId: field.id, values: value });
      return;
    }
    dispatch({ type: 'field-text', fieldId: field.id, values: value === '' ? [] : [value] });
  };
  return (
    <ComboboxSelect
      options={options}
      value={selectedValue}
      multiple={field.cardinality === 'many'}
      onChange={setValue}
      placeholder="Choose an option"
      searchPlaceholder={`Search ${field.label.toLocaleLowerCase()}`}
      aria-label={field.label}
      id={`field-${field.id}`}
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
        error={props.error}
        dispatch={props.dispatch}
      />
    );
  if (field.kind === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-3">
        <Checkbox
          checked={props.draft.fields.booleans[field.id] ?? false}
          onCheckedChange={(checked) =>
            props.dispatch({
              type: 'field-boolean',
              fieldId: field.id,
              value: checked === true,
            })
          }
        />{' '}
        <span className="text-sm">Yes</span>
      </label>
    );
  }
  if (field.kind === 'enum') return <EnumEditor {...props} />;
  if (field.kind === 'reference') return <ReferenceField {...props} />;
  return (
    <TextFieldEditor
      field={props.field}
      draft={props.draft}
      error={props.error}
      dispatch={props.dispatch}
    />
  );
}
