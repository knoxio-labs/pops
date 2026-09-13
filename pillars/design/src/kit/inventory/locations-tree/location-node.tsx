import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder } from 'lucide-react';
import { useState } from 'react';

import { Collapsible, CollapsibleContent } from '@pops/ui';

import { DropIndicatorLine } from './drop-indicator-line';
import { InlineInput } from './inline-input';
import { NodeRow } from './node-row';

import type { LocationTreeNode } from './utils';

export interface LocationNodeProps {
  node: LocationTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, newName: string) => void;
  onMoveStart: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
  onInsuranceReport: (locationId: string) => void;
  addingChildOf: string | null;
  onNewChildSave: (name: string) => void;
  onNewChildCancel: () => void;
  siblingIndex: number;
  siblingCount: number;
  overId: string | null;
  activeId: string | null;
  /**
   * Two seeds for local per-node state that the source keeps entirely
   * internal (`useState(depth < 1)`, `useState(false)`): a screen state that
   * wants a deep node open, or a node caught mid-rename, has no server round
   * trip to drive that, so it seeds it here instead.
   */
  initialExpandedIds?: ReadonlySet<string>;
  initialRenamingId?: string | null;
}

function NewChildInput({
  depth,
  onSave,
  onCancel,
}: {
  depth: number;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 py-1.5 px-2"
      style={{
        paddingLeft: `calc(${depth + 1} * var(--tree-indent-step) + var(--tree-indent-base))`,
      }}
    >
      <span className="w-5.5" />
      <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
      <InlineInput onSave={onSave} onCancel={onCancel} placeholder="Location name" />
    </div>
  );
}

function ChildrenList(props: LocationNodeProps) {
  const { node, depth, addingChildOf, onNewChildSave, onNewChildCancel } = props;
  const isAddingChild = addingChildOf === node.id;
  return (
    <SortableContext items={node.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
      <div role="group">
        {node.children.map((child, i) => (
          <LocationNode
            key={child.id}
            {...props}
            node={child}
            depth={depth + 1}
            siblingIndex={i}
            siblingCount={node.children.length}
          />
        ))}
        {isAddingChild && (
          <NewChildInput depth={depth} onSave={onNewChildSave} onCancel={onNewChildCancel} />
        )}
      </div>
    </SortableContext>
  );
}

interface NodeStateArgs {
  node: LocationTreeNode;
  depth: number;
  isAddingChild: boolean;
  initialExpandedIds: ReadonlySet<string> | undefined;
  initialRenamingId: string | null | undefined;
}

function useNodeState({
  node,
  depth,
  isAddingChild,
  initialExpandedIds,
  initialRenamingId,
}: NodeStateArgs) {
  const [open, setOpen] = useState((initialExpandedIds?.has(node.id) ?? false) || depth < 1);
  const [renaming, setRenaming] = useState(node.id === initialRenamingId);
  const [wasAddingChild, setWasAddingChild] = useState(isAddingChild);

  if (isAddingChild !== wasAddingChild) {
    setWasAddingChild(isAddingChild);
    if (isAddingChild && !open) setOpen(true);
  }

  return { open, setOpen, renaming, setRenaming };
}

function useNodeSortable(nodeId: string, overId: string | null, activeId: string | null) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: nodeId });
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const showDropLine = overId === nodeId && activeId !== null && activeId !== nodeId && !isDragging;

  return {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
    isOver,
    sortableStyle,
    showDropLine,
  };
}

export function LocationNode(props: LocationNodeProps) {
  const { node, depth, selectedId, addingChildOf, overId, activeId } = props;
  const isAddingChild = addingChildOf === node.id;
  const { open, setOpen, renaming, setRenaming } = useNodeState({
    node,
    depth,
    isAddingChild,
    initialExpandedIds: props.initialExpandedIds,
    initialRenamingId: props.initialRenamingId,
  });
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
    isOver,
    sortableStyle,
    showDropLine,
  } = useNodeSortable(node.id, overId, activeId);

  return (
    <div ref={setNodeRef} style={sortableStyle}>
      {showDropLine && <DropIndicatorLine depth={depth} />}
      <Collapsible open={open} onOpenChange={setOpen}>
        <NodeRow
          node={node}
          depth={depth}
          open={open}
          hasChildren={hasChildren}
          isSelected={isSelected}
          isOver={isOver}
          isDragging={isDragging}
          renaming={renaming}
          setRenaming={setRenaming}
          siblingIndex={props.siblingIndex}
          siblingCount={props.siblingCount}
          attributes={attributes}
          listeners={listeners}
          setActivatorNodeRef={setActivatorNodeRef}
          onSelect={props.onSelect}
          onAddChild={props.onAddChild}
          onRename={props.onRename}
          onMoveStart={props.onMoveStart}
          onReorder={props.onReorder}
          onDelete={props.onDelete}
          onInsuranceReport={props.onInsuranceReport}
        />
        {(hasChildren || isAddingChild) && (
          <CollapsibleContent forceMount={isAddingChild ? true : undefined}>
            <ChildrenList {...props} />
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}
