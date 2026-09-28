import { useId } from 'react';

import { ComboboxSelect, Input, Label } from '@pops/ui';

import type { ReactElement } from 'react';

import type { FormTypeDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';

interface TypeTreeOption {
  readonly value: string;
  readonly pathLabel: string;
  readonly depth: number;
}

const NO_TYPE = '__none__';

function parentTypeIdOf(type: FormTypeDef): string | null {
  if (!('parentTypeId' in type)) return null;
  const parentTypeId = type.parentTypeId;
  return typeof parentTypeId === 'string' || parentTypeId === null ? parentTypeId : null;
}

function typePath(types: readonly FormTypeDef[], typeId: string): FormTypeDef[] {
  const index = new Map(types.map((type) => [type.id, type] as const));
  const path: FormTypeDef[] = [];
  const seen = new Set<string>();
  let current = index.get(typeId);
  while (current !== undefined && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    const parent = parentTypeIdOf(current);
    current = parent === null ? undefined : index.get(parent);
  }
  return path;
}

function flattenTypeTree(types: readonly FormTypeDef[]): FormTypeDef[] {
  const ids = new Set(types.map((type) => type.id));
  const children = new Map<string | null, FormTypeDef[]>();
  for (const type of types) {
    const parentTypeId = parentTypeIdOf(type);
    const parent = parentTypeId !== null && ids.has(parentTypeId) ? parentTypeId : null;
    children.set(parent, [...(children.get(parent) ?? []), type]);
  }

  const flattened: FormTypeDef[] = [];
  const visited = new Set<string>();
  const visit = (parentTypeId: string | null): void => {
    for (const type of children.get(parentTypeId) ?? []) {
      if (visited.has(type.id)) continue;
      visited.add(type.id);
      flattened.push(type);
      visit(type.id);
    }
  };
  visit(null);
  for (const type of types) if (!visited.has(type.id)) visit(type.id);
  return flattened;
}

function typeTreeOptions(types: readonly FormTypeDef[], query = ''): TypeTreeOption[] {
  const flattened = flattenTypeTree(types);
  const normalised = query.trim().toLocaleLowerCase();
  const visible = new Set<string>();

  for (const type of flattened) {
    const path = typePath(types, type.id);
    const pathLabel = path.map((ancestor) => ancestor.label).join(' › ');
    if (normalised === '' || pathLabel.toLocaleLowerCase().includes(normalised)) {
      for (const ancestor of path) visible.add(ancestor.id);
    }
  }

  return flattened.flatMap((type) => {
    if (!visible.has(type.id)) return [];
    const path = typePath(types, type.id);
    return [
      {
        value: type.id,
        pathLabel: path.map((ancestor) => ancestor.label).join(' › '),
        depth: Math.max(path.length, 1),
      },
    ];
  });
}

function typePickerOptions(types: readonly FormTypeDef[]): {
  options: { value: string; label: string }[];
  typeIdByValue: ReadonlyMap<string, string>;
  valueByTypeId: ReadonlyMap<string, string>;
} {
  const typeIdByValue = new Map<string, string>();
  const valueByTypeId = new Map<string, string>();
  const treeOptions = typeTreeOptions(types);
  const options = treeOptions.map((option) => {
    const searchableLabels = treeOptions
      .filter((candidate) =>
        typePath(types, candidate.value).some((type) => type.id === option.value)
      )
      .map((candidate) => candidate.pathLabel)
      .join(' ');
    const value = `${option.value}::${searchableLabels}`;
    typeIdByValue.set(value, option.value);
    valueByTypeId.set(option.value, value);
    return {
      value,
      label: `${'  '.repeat(option.depth - 1)}${option.pathLabel}`,
    };
  });
  return { options, typeIdByValue, valueByTypeId };
}

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
  const picker = typePickerOptions(types);
  const options = [
    ...(allowNoType ? [{ value: NO_TYPE, label: 'No type yet' }] : []),
    ...picker.options,
  ];
  const setType = (value: string | string[]): void => {
    const selectedValue = typeof value === 'string' ? value : (value[0] ?? NO_TYPE);
    const selected =
      selectedValue === NO_TYPE ? null : (picker.typeIdByValue.get(selectedValue) ?? null);
    const selectedType = types.find((candidate) => candidate.id === selected);
    dispatch({ type: 'type', typeId: selected, containment: selectedType?.containment === true });
  };
  const selectedValue =
    draft.typeId === null ? NO_TYPE : (picker.valueByTypeId.get(draft.typeId) ?? draft.typeId);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Type</Label>
      <ComboboxSelect
        id={id}
        aria-label="Type"
        options={options}
        value={selectedValue}
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
