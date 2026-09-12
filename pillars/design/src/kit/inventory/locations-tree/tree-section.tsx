import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Folder, GripVertical } from 'lucide-react';

import { Badge, Skeleton } from '@pops/ui';

import { LocationNode } from './location-node';
import { countDescendants } from './utils';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';

import type { LocationNodeProps } from './location-node';
import type { LocationTreeNode } from './utils';

function TreeSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2"
          style={{ paddingLeft: `calc(${i % 3} * var(--tree-indent-step))` }}
        >
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

function DragOverlayNode({ node }: { node: LocationTreeNode }) {
  return (
    <div className="flex items-center gap-2 bg-background border rounded-md px-3 py-2 shadow-lg">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      <Folder className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{node.name}</span>
      {node.children.length > 0 && (
        <Badge variant="secondary" className="text-xs">
          {countDescendants(node) + 1}
        </Badge>
      )}
    </div>
  );
}

export interface TreeSectionProps {
  treeNodes: LocationTreeNode[];
  isLoading: boolean;
  selectedId: string | null;
  addingChildOf: string | null;
  overId: string | null;
  activeId: string | null;
  activeNode: LocationTreeNode | null | undefined;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, newName: string) => void;
  onMoveStart: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
  onInsuranceReport: (locationId: string) => void;
  onNewChildSave: (name: string) => void;
  onNewChildCancel: () => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  initialExpandedIds?: ReadonlySet<string>;
  initialRenamingId?: string | null;
}

function TreeNodeList(
  props: Omit<
    TreeSectionProps,
    'isLoading' | 'activeNode' | 'onDragStart' | 'onDragOver' | 'onDragEnd'
  >
) {
  const nodeProps: Omit<LocationNodeProps, 'node' | 'depth' | 'siblingIndex' | 'siblingCount'> =
    props;
  return (
    <SortableContext
      items={props.treeNodes.map((n) => n.id)}
      strategy={verticalListSortingStrategy}
    >
      {props.treeNodes.map((node, i) => (
        <LocationNode
          key={node.id}
          {...nodeProps}
          node={node}
          depth={0}
          siblingIndex={i}
          siblingCount={props.treeNodes.length}
        />
      ))}
    </SortableContext>
  );
}

/** Ported from the app's `TreeSection.tsx`. */
export function TreeSection(props: TreeSectionProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  if (props.isLoading) return <TreeSkeleton />;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDragEnd={props.onDragEnd}
    >
      <div className="md:w-2/5 border rounded-lg py-2" role="tree" aria-label="Location tree">
        <TreeNodeList {...props} />
      </div>
      <DragOverlay>
        {props.activeNode ? <DragOverlayNode node={props.activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
