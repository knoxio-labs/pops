/**
 * TreePicker — TreeView inside a Popover with search, an optional inline
 * create, and an optional footer slot (clear selection + persistent create).
 *
 * Generic over the node data. Consumers resolve display labels through
 * `getLabel(data)`. Filter is a recursive substring match on labels.
 */
import { Check, Search } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { cn } from '../lib/utils';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { NoMatches, PickerFooter } from './TreePicker.footer';
import { type TreeNode, TreeView } from './TreeView';

export interface TreePickerProps<T> {
  nodes: TreeNode<T>[];
  getLabel: (data: T) => string;
  selectedId?: string | null;
  onSelect: (node: TreeNode<T>) => void;
  /** Optional inline create action, also offered from the footer's persistent create row. */
  onCreate?: (query: string, parent: TreeNode<T> | null) => void;
  /**
   * Optional clear action. When supplied, a "Clear selection" row appears in
   * the footer while `selectedId` is set, returning the field to empty.
   */
  onClear?: () => void;
  /** Label for the footer's persistent create row. Defaults to "Create new". */
  createLabel?: string;
  placeholder?: string;
  trigger?: ReactNode;
  triggerLabel?: ReactNode;
  disabled?: boolean;
  className?: string;
}

function filterNodes<T>(nodes: TreeNode<T>[], predicate: (data: T) => boolean): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  for (const n of nodes) {
    const kids = filterNodes(n.children, predicate);
    if (predicate(n.data) || kids.length > 0) {
      out.push({ ...n, children: kids });
    }
  }
  return out;
}

function collectIds<T>(nodes: TreeNode<T>[], into: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    into.add(n.id);
    collectIds(n.children, into);
  }
  return into;
}

function useFilteredNodes<T>(nodes: TreeNode<T>[], getLabel: (data: T) => string, query: string) {
  const filtered = useMemo(() => {
    if (!query.trim()) return nodes;
    const needle = query.toLowerCase();
    return filterNodes(nodes, (d) => getLabel(d).toLowerCase().includes(needle));
  }, [nodes, query, getLabel]);

  const expandedIds = useMemo(() => {
    if (query.trim()) return collectIds(filtered);
    return new Set<string>();
  }, [filtered, query]);

  return { filtered, expandedIds };
}

interface PickerBodyProps<T> {
  query: string;
  setQuery: (v: string) => void;
  placeholder: string;
  filtered: TreeNode<T>[];
  expandedIds: Set<string>;
  onCreate?: (q: string, parent: TreeNode<T> | null) => void;
  onClear?: () => void;
  createLabel: string;
  selectedId: string | null;
  onSelect: (n: TreeNode<T>) => void;
  getLabel: (data: T) => string;
}

function PickerBody<T>({
  query,
  setQuery,
  placeholder,
  filtered,
  expandedIds,
  onCreate,
  onClear,
  createLabel,
  selectedId,
  onSelect,
  getLabel,
}: PickerBodyProps<T>) {
  return (
    <PopoverContent className="w-80 p-0" align="start">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-7 border-0 p-0 focus-visible:ring-0 shadow-none"
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <NoMatches query={query} onCreate={onCreate} onCreated={() => setQuery('')} />
        ) : (
          <TreeView
            nodes={filtered}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedIds={expandedIds.size > 0 ? expandedIds : undefined}
            renderNode={(node, { selected }) => (
              <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
                <span className={cn('truncate', selected && 'font-medium')}>
                  {getLabel(node.data)}
                </span>
                {selected ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
              </div>
            )}
          />
        )}
      </div>
      <PickerFooter
        hasSelection={selectedId != null}
        onClear={onClear}
        onCreate={onCreate}
        createLabel={createLabel}
      />
    </PopoverContent>
  );
}

export function TreePicker<T>({
  nodes,
  getLabel,
  selectedId = null,
  onSelect,
  onCreate,
  onClear,
  createLabel = 'Create new',
  placeholder = 'Search…',
  trigger,
  triggerLabel,
  disabled,
  className,
}: TreePickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { filtered, expandedIds } = useFilteredNodes(nodes, getLabel, query);

  const handleSelect = useCallback(
    (node: TreeNode<T>) => {
      onSelect(node);
      setOpen(false);
      setQuery('');
    },
    [onSelect]
  );

  const handleClear = useCallback(() => {
    onClear?.();
    setOpen(false);
    setQuery('');
  }, [onClear]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline" disabled={disabled} className={className}>
            {triggerLabel ?? 'Select…'}
          </Button>
        )}
      </PopoverTrigger>
      <PickerBody
        query={query}
        setQuery={setQuery}
        placeholder={placeholder}
        filtered={filtered}
        expandedIds={expandedIds}
        onCreate={onCreate}
        onClear={onClear ? handleClear : undefined}
        createLabel={createLabel}
        selectedId={selectedId}
        onSelect={handleSelect}
        getLabel={getLabel}
      />
    </Popover>
  );
}
