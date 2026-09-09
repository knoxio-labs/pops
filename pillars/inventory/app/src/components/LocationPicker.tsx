import { MapPin } from 'lucide-react';
import { useMemo } from 'react';

import { cn, type TreeNode, TreePicker } from '@pops/ui';

export interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children: LocationTreeNode[];
}

export interface LocationPickerProps {
  id?: string;
  value?: string | null;
  onChange?: (locationId: string | null) => void;
  locations: LocationTreeNode[];
  onCreateLocation?: (name: string, parentId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Path from the root to `targetId`, or `[]` if `targetId` isn't in the tree. */
function buildPath(nodes: LocationTreeNode[], targetId: string): LocationTreeNode[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    const childPath = buildPath(node.children, targetId);
    if (childPath.length > 0) return [node, ...childPath];
  }
  return [];
}

function toTreeNodes(nodes: LocationTreeNode[]): TreeNode<LocationTreeNode>[] {
  return nodes.map((node) => ({
    id: node.id,
    data: node,
    children: toTreeNodes(node.children),
  }));
}

/**
 * Location tree picker built on kit `TreePicker`: search, keyboard tree
 * navigation, and expand/collapse all come from the kit component. This
 * component only adapts the flat `LocationTreeNode` shape and supplies the
 * breadcrumb trigger and the "create under the current selection" behaviour
 * the inventory app relies on.
 */
export function LocationPicker({
  id,
  value,
  onChange,
  locations,
  onCreateLocation,
  placeholder = 'Select location…',
  disabled = false,
  className,
}: LocationPickerProps) {
  const treeNodes = useMemo(() => toTreeNodes(locations), [locations]);
  const selectedPath = useMemo(
    () => (value ? buildPath(locations, value) : []),
    [locations, value]
  );
  const hasValue = selectedPath.length > 0;

  return (
    <TreePicker
      id={id}
      nodes={treeNodes}
      getLabel={(data) => data.name}
      selectedId={value ?? null}
      onSelect={(node) => onChange?.(node.id)}
      onClear={onChange ? () => onChange(null) : undefined}
      onCreate={onCreateLocation ? (name) => onCreateLocation(name, value ?? null) : undefined}
      createLabel="Add location"
      placeholder="Search locations…"
      disabled={disabled}
      className={cn(
        'w-full justify-start text-left font-normal h-9',
        !hasValue && 'text-muted-foreground',
        className
      )}
      triggerLabel={
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          <span className="truncate text-sm">
            {hasValue ? selectedPath.map((n) => n.name).join(' › ') : placeholder}
          </span>
        </span>
      }
    />
  );
}

LocationPicker.displayName = 'LocationPicker';
