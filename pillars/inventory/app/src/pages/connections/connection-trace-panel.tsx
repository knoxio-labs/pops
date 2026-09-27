import { Package, Plug, X } from 'lucide-react';
import { useMemo } from 'react';

import { Badge, ButtonPrimitive } from '@pops/ui';

import { CodeBadge } from '../../foundation/badges/badges.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { connectionEndName, fixtureKindLabel } from './connection-model.js';

import type { ReactElement } from 'react';

import type { ConnectionTrace, ConnectionTraceNode } from './connection-trace.js';

function breadthFirstNodes(root: ConnectionTraceNode): ConnectionTraceNode[] {
  const nodes: ConnectionTraceNode[] = [];
  const queue: ConnectionTraceNode[] = [root];
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    if (node === undefined) continue;
    nodes.push(node);
    queue.push(...node.children);
  }
  return nodes;
}

function TraceRow({ node, onOpen }: { node: ConnectionTraceNode; onOpen: (id: string) => void }) {
  const item = node.end.kind === 'item' ? node.end : null;
  const Icon = item === null ? Plug : Package;
  const name = connectionEndName(node.end);
  const content = (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      {node.end.kind === 'fixture' ? (
        <Badge variant="outline">
          {fixtureKindLabel(node.end.fixture.kind, node.end.fixture.type)}
        </Badge>
      ) : (
        <CodeBadge code={node.end.kind === 'item' ? node.end.item.code : null} />
      )}
    </span>
  );

  return (
    <li
      role="treeitem"
      aria-level={node.depth + 1}
      className={`min-h-11 border-b border-border/60 px-3 last:border-b-0 ${
        node.depth === 0 ? 'bg-app-accent/5' : ''
      }`}
      style={{ paddingLeft: `${12 + node.depth * 20}px` }}
    >
      {item !== null ? (
        <button
          type="button"
          className="flex min-h-11 min-w-11 w-full items-center text-left hover:text-app-accent"
          aria-label={`Open ${name}`}
          onClick={() => onOpen(item.item.id)}
        >
          {content}
        </button>
      ) : (
        <span className="flex min-h-11 w-full min-w-0 items-center">{content}</span>
      )}
    </li>
  );
}

/** Props for {@link ConnectionTracePanel}. */
export interface ConnectionTracePanelProps {
  trace: ConnectionTrace;
  onClose: () => void;
  onOpenItem: (id: string) => void;
}

/** Displays the breadth-first chain for one selected item. */
export function ConnectionTracePanel({
  trace,
  onClose,
  onOpenItem,
}: ConnectionTracePanelProps): ReactElement {
  const nodes = useMemo(() => breadthFirstNodes(trace.root), [trace.root]);

  return (
    <aside
      aria-label={`Connection trace from ${connectionEndName(trace.root.end)}`}
      className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border bg-card lg:w-80"
    >
      <header className="flex items-start gap-2 border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            Chain from {connectionEndName(trace.root.end)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {trace.items} {trace.items === 1 ? 'item' : 'items'} and {trace.fixtures}{' '}
            {trace.fixtures === 1 ? 'fixture' : 'fixtures'} reach{' '}
            {connectionEndName(trace.root.end)}.
          </p>
        </div>
        <HintTooltip label="Close connection trace" shortcutId="dismiss">
          <ButtonPrimitive
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close connection trace"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </ButtonPrimitive>
        </HintTooltip>
      </header>
      <ol
        aria-label="Reachable connection chain"
        role="tree"
        className="min-h-0 flex-1 overflow-y-auto py-1"
      >
        {nodes.map((node) => (
          <TraceRow key={node.key} node={node} onOpen={onOpenItem} />
        ))}
      </ol>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Fixtures end a chain: two things on one outlet are not connected to each other.
      </p>
    </aside>
  );
}
