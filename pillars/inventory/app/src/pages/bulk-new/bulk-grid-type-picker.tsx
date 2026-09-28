import { ChevronsUpDown } from 'lucide-react';

import { Button, TreePicker, type TreeNode } from '@pops/ui';

import { typePathLabel } from '../../lib/type-tree.js';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

/** Data rendered for one published type in the bulk-entry tree. */
export interface BulkTypePickerNodeData {
  readonly type: CatalogueType;
  readonly pathLabel: string;
}

/** Props for the searchable type tree used by a bulk-entry Type cell. */
export interface BulkTypePickerProps {
  readonly index: number;
  readonly value: string;
  readonly types: readonly CatalogueType[];
  readonly nodes: readonly TreeNode<BulkTypePickerNodeData>[];
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

function childrenByParent(types: readonly CatalogueType[]): Map<string | null, CatalogueType[]> {
  const ids = new Set(types.map((type) => type.id));
  const children = new Map<string | null, CatalogueType[]>();
  for (const type of types) {
    const parent =
      type.parentTypeId !== null && ids.has(type.parentTypeId) ? type.parentTypeId : null;
    children.set(parent, [...(children.get(parent) ?? []), type]);
  }
  return children;
}

/** Builds the active catalogue types as the nested tree consumed by TreePicker. */
export function buildBulkTypeTree(
  types: readonly CatalogueType[]
): TreeNode<BulkTypePickerNodeData>[] {
  const active = types.filter((type) => type.archivedAt === null);
  const activeIds = new Set(active.map((type) => type.id));
  const children = childrenByParent(active);
  const visited = new Set<string>();
  const buildNode = (
    type: CatalogueType,
    ancestors: ReadonlySet<string>
  ): TreeNode<BulkTypePickerNodeData> => {
    visited.add(type.id);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(type.id);
    return {
      id: type.id,
      data: { type, pathLabel: typePathLabel(types, type.id) },
      children: (children.get(type.id) ?? [])
        .filter((child) => !nextAncestors.has(child.id) && !visited.has(child.id))
        .map((child) => buildNode(child, nextAncestors)),
    };
  };
  const nodes: TreeNode<BulkTypePickerNodeData>[] = [];
  for (const type of active) {
    if (
      (type.parentTypeId === null || !activeIds.has(type.parentTypeId)) &&
      !visited.has(type.id)
    ) {
      nodes.push(buildNode(type, new Set()));
    }
  }
  for (const type of active) {
    if (!visited.has(type.id)) nodes.push(buildNode(type, new Set()));
  }
  return nodes;
}

function selectedTypeId(types: readonly CatalogueType[], value: string): string | null {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === '') return null;
  return (
    types.find(
      (type) =>
        type.archivedAt === null &&
        [type.label, typePathLabel(types, type.id)].some(
          (label) => label.toLocaleLowerCase() === normalized
        )
    )?.id ?? null
  );
}

/** Renders the hierarchical picker and writes full path labels into its cell. */
export function BulkTypePicker({
  index,
  value,
  types,
  nodes,
  disabled,
  onChange,
}: BulkTypePickerProps) {
  return (
    <TreePicker
      nodes={[...nodes]}
      getLabel={(data) => data.pathLabel}
      selectedId={selectedTypeId(types, value)}
      onSelect={(node) => onChange(node.data.pathLabel)}
      onClear={() => onChange('')}
      placeholder="Search types"
      disabled={disabled}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Choose Type, row ${String(index + 1)}`}
          disabled={disabled}
          className="absolute top-1/2 right-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </Button>
      }
    />
  );
}
