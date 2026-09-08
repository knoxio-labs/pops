/**
 * TreeView — recursive read-only tree with expand/collapse and keyboard nav.
 *
 * Generic over the node data shape. Consumers pass pre-built `TreeNode<T>`
 * objects via `nodes`, where each node includes its `children`, along with a
 * `renderNode` renderer. Selection and expansion are controlled or
 * uncontrolled via `defaultExpandedIds` / `expandedIds` + `onExpandedChange`.
 *
 * Follows the WAI-ARIA tree pattern for keyboard focus: a single roving tab
 * stop (only the active row carries `tabIndex={0}`, every other row is
 * `tabIndex={-1}`), with ArrowUp/ArrowDown/Home/End moving that tab stop
 * across visible rows — a collapsed node's children are not visited.
 * ArrowRight/ArrowLeft still expand/collapse and never move focus.
 */
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { cn } from '../lib/utils';
import { type TreeNode } from './tree-node';
import { useTreeRovingFocus } from './useTreeRovingFocus';

export type { TreeNode } from './tree-node';

export interface TreeViewProps<T> {
  nodes: TreeNode<T>[];
  renderNode: (
    node: TreeNode<T>,
    state: { level: number; expanded: boolean; selected: boolean }
  ) => ReactNode;
  selectedId?: string | null;
  onSelect?: (node: TreeNode<T>) => void;
  expandedIds?: Set<string>;
  defaultExpandedIds?: Iterable<string>;
  onExpandedChange?: (next: Set<string>) => void;
  className?: string;
}

function flattenTree<T>(nodes: TreeNode<T>[], expanded: Set<string>) {
  const out: { node: TreeNode<T>; level: number }[] = [];
  const walk = (list: TreeNode<T>[], level: number) => {
    for (const n of list) {
      out.push({ node: n, level });
      if (expanded.has(n.id)) walk(n.children, level + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

interface TreeRowProps<T> {
  node: TreeNode<T>;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  toggle: (id: string) => void;
  onSelect?: (node: TreeNode<T>) => void;
  renderNode: TreeViewProps<T>['renderNode'];
}

function TreeRow<T>({
  node,
  level,
  isExpanded,
  isSelected,
  toggle,
  onSelect,
  renderNode,
}: TreeRowProps<T>) {
  const hasChildren = node.children.length > 0;
  return (
    <div
      className={cn(
        'flex items-center gap-1 py-1',
        isSelected && 'bg-accent text-accent-foreground rounded-sm'
      )}
      style={{
        paddingLeft: `calc(${level} * var(--tree-indent-step) + var(--tree-indent-base))`,
      }}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            toggle(node.id);
          }}
          className="p-0.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')}
            aria-hidden
          />
        </button>
      ) : (
        <span className="inline-block w-5" aria-hidden />
      )}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect?.(node)}>
        {renderNode(node, { level, expanded: isExpanded, selected: isSelected })}
      </div>
    </div>
  );
}

interface TreeRowListProps<T> {
  flat: { node: TreeNode<T>; level: number }[];
  expanded: Set<string>;
  selectedId: string | null;
  activeId: string | null;
  registerItem: (id: string, el: HTMLLIElement | null) => void;
  handleKeyDown: ReturnType<typeof useTreeRovingFocus<T>>['handleKeyDown'];
  onItemFocus: (id: string) => void;
  toggle: (id: string) => void;
  onSelect?: (node: TreeNode<T>) => void;
  renderNode: TreeViewProps<T>['renderNode'];
}

function TreeRowList<T>({
  flat,
  expanded,
  selectedId,
  activeId,
  registerItem,
  handleKeyDown,
  onItemFocus,
  toggle,
  onSelect,
  renderNode,
}: TreeRowListProps<T>) {
  return (
    <>
      {flat.map((entry, i) => {
        const { node, level } = entry;
        const isExpanded = expanded.has(node.id);
        const isSelected = node.id === selectedId;
        return (
          <li
            key={node.id}
            ref={(el) => registerItem(node.id, el)}
            role="treeitem"
            aria-expanded={node.children.length > 0 ? isExpanded : undefined}
            aria-selected={isSelected}
            aria-level={level + 1}
            tabIndex={node.id === activeId ? 0 : -1}
            onKeyDown={handleKeyDown(i)}
            onFocus={() => onItemFocus(node.id)}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <TreeRow
              node={node}
              level={level}
              isExpanded={isExpanded}
              isSelected={isSelected}
              toggle={toggle}
              onSelect={onSelect}
              renderNode={renderNode}
            />
          </li>
        );
      })}
    </>
  );
}

export function TreeView<T>({
  nodes,
  renderNode,
  selectedId = null,
  onSelect,
  expandedIds,
  defaultExpandedIds,
  onExpandedChange,
  className,
}: TreeViewProps<T>) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds ?? [])
  );
  const expanded = expandedIds ?? internalExpanded;

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (!expandedIds) setInternalExpanded(next);
      onExpandedChange?.(next);
    },
    [expanded, expandedIds, onExpandedChange]
  );

  const flat = useMemo(() => flattenTree(nodes, expanded), [nodes, expanded]);

  const { activeId, registerItem, handleKeyDown, onItemFocus } = useTreeRovingFocus({
    flat,
    expanded,
    toggle,
    onSelect,
    selectedId,
  });

  return (
    <ul role="tree" className={cn('flex flex-col', className)}>
      <TreeRowList
        flat={flat}
        expanded={expanded}
        selectedId={selectedId}
        activeId={activeId}
        registerItem={registerItem}
        handleKeyDown={handleKeyDown}
        onItemFocus={onItemFocus}
        toggle={toggle}
        onSelect={onSelect}
        renderNode={renderNode}
      />
    </ul>
  );
}
