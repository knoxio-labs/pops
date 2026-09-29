import { ChevronsUpDown } from 'lucide-react';
import { useId, useMemo } from 'react';

import { Button, Input, Label, TreePicker, type TreeNode } from '@pops/ui';

import { ancestorIds, typePath } from '../../lib/type-tree';

import type { ReactElement } from 'react';

import type { CatalogueType } from '../../catalogue-editor/types';
import type { FormTypeDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';

interface TypePickerData {
  readonly type: FormTypeDef | null;
  readonly pathLabel: string;
}

const NO_TYPE = '__none__';

function catalogueTypeForTree(type: FormTypeDef, sortOrder: number): CatalogueType {
  return {
    archivedAt: null,
    capabilities: type.containment ? ['containment'] : [],
    description: type.description,
    fields: [],
    id: type.id,
    key: type.key,
    label: type.label,
    legacyLabels: [],
    parentTypeId: type.parentTypeId ?? null,
    presentation: {},
    replacedBy: null,
    revision: 0,
    sortOrder,
  };
}

function typePickerModel(
  types: readonly FormTypeDef[],
  allowNoType: boolean
): {
  readonly nodes: TreeNode<TypePickerData>[];
  readonly labelByTypeId: ReadonlyMap<string, string>;
} {
  const treeTypes = types.map(catalogueTypeForTree);
  const labelByTypeId = new Map(
    treeTypes.map((type) => [type.id, typePath(treeTypes, type.id).join(' › ')] as const)
  );
  const parentByTypeId = new Map(
    treeTypes.map((type) => [type.id, ancestorIds(treeTypes, type.id).at(-1) ?? null] as const)
  );
  const childrenByParent = new Map<string | null, FormTypeDef[]>();
  for (const type of types) {
    const parentId = parentByTypeId.get(type.id) ?? null;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), type]);
  }

  const visited = new Set<string>();
  const buildNode = (type: FormTypeDef, active: ReadonlySet<string>): TreeNode<TypePickerData> => {
    visited.add(type.id);
    const nextActive = new Set(active);
    nextActive.add(type.id);
    return {
      id: type.id,
      data: {
        type,
        pathLabel: labelByTypeId.get(type.id) ?? type.label,
      },
      children: (childrenByParent.get(type.id) ?? [])
        .filter((child) => !nextActive.has(child.id) && !visited.has(child.id))
        .map((child) => buildNode(child, nextActive)),
    };
  };

  const nodes: TreeNode<TypePickerData>[] = [];
  for (const type of types) {
    if ((parentByTypeId.get(type.id) ?? null) === null && !visited.has(type.id)) {
      nodes.push(buildNode(type, new Set()));
    }
  }
  for (const type of types) {
    if (!visited.has(type.id)) nodes.push(buildNode(type, new Set()));
  }
  if (allowNoType) {
    nodes.unshift({ id: NO_TYPE, data: { type: null, pathLabel: 'No type yet' }, children: [] });
  }
  return { nodes, labelByTypeId };
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
  const picker = useMemo(() => typePickerModel(types, allowNoType), [allowNoType, types]);
  const selectedLabel =
    draft.typeId === null
      ? 'No type yet'
      : (picker.labelByTypeId.get(draft.typeId) ?? type?.label ?? 'No type yet');
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Type</Label>
      <TreePicker
        nodes={picker.nodes}
        getLabel={(data) => data.pathLabel}
        selectedId={draft.typeId ?? (allowNoType ? NO_TYPE : null)}
        onSelect={(node) => {
          const selectedType = node.data.type;
          dispatch({
            type: 'type',
            typeId: selectedType?.id ?? null,
            containment: selectedType?.containment === true,
          });
        }}
        placeholder="Search types"
        trigger={
          <Button
            id={id}
            type="button"
            role="combobox"
            aria-label="Type"
            variant="outline"
            className="w-full justify-between"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        }
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
