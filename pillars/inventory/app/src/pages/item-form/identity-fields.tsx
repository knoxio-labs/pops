import { useId } from 'react';

import { ComboboxSelect, Input, Label } from '@pops/ui';

import type { ReactElement } from 'react';

import type { FormTypeDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';

/** Props for the name, type and note controls. */
export interface IdentityFieldsProps {
  readonly draft: ItemDraft;
  readonly type: FormTypeDef | null;
  readonly types: readonly FormTypeDef[];
  readonly allowNoType: boolean;
  readonly nameError: string | null;
  readonly dispatch: (action: DraftAction) => void;
}

function NameField({
  draft,
  nameError,
  dispatch,
}: Pick<IdentityFieldsProps, 'draft' | 'nameError' | 'dispatch'>): ReactElement {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Name</Label>
      <Input
        id={id}
        autoFocus={draft.mode === 'create'}
        value={draft.name}
        onChange={(event) => dispatch({ type: 'name', value: event.target.value })}
        aria-invalid={nameError !== null}
        aria-describedby={nameError === null ? undefined : `${id}-error`}
        placeholder="What is it?"
      />
      {nameError ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {nameError}
        </p>
      ) : null}
    </div>
  );
}

function TypeField({
  draft,
  type,
  types,
  allowNoType,
  dispatch,
}: Pick<
  IdentityFieldsProps,
  'draft' | 'type' | 'types' | 'allowNoType' | 'dispatch'
>): ReactElement {
  const id = useId();
  const options = [
    ...(allowNoType ? [{ value: '__none__', label: 'No type yet' }] : []),
    ...types.map((candidate) => ({ value: candidate.id, label: candidate.label })),
  ];
  const setType = (value: string | string[]): void => {
    const selected = typeof value === 'string' && value !== '__none__' ? value : null;
    const selectedType = types.find((candidate) => candidate.id === selected);
    dispatch({ type: 'type', typeId: selected, containment: selectedType?.containment === true });
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Type</Label>
      <ComboboxSelect
        id={id}
        aria-label="Type"
        options={options}
        value={draft.typeId ?? '__none__'}
        onChange={setType}
        placeholder="No type yet"
        searchPlaceholder="Search types"
        emptyMessage="No matching types"
      />
      {type?.containment === true ? (
        <p className="text-sm text-muted-foreground">
          A container: it holds other items and is always one.
        </p>
      ) : null}
    </div>
  );
}

/** Renders the identity controls that decide which fields appear below. */
export function IdentityFields({
  draft,
  type,
  types,
  allowNoType,
  nameError,
  dispatch,
}: IdentityFieldsProps): ReactElement {
  return (
    <div className="space-y-5">
      <NameField draft={draft} nameError={nameError} dispatch={dispatch} />
      <TypeField
        draft={draft}
        type={type}
        types={types}
        allowNoType={allowNoType}
        dispatch={dispatch}
      />
    </div>
  );
}
