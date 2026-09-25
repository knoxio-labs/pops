import { HintTooltip } from '@/kit/inventory/foundation';
/**
 * The trace pane beside the registry: everything reachable from one item,
 * one row per thing at its shortest distance, indented by hops. Fixtures end
 * a branch. The pane says how far the chain reaches before listing it.
 */
import { X } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { endName } from './connection-model';
import { EndCell } from './registry-row';

import type { Chain, ChainNode } from './connection-trace';

function flatten(node: ChainNode): ChainNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

function reach(chain: Chain): string {
  const parts = [
    chain.items === 1 ? '1 item' : `${chain.items} items`,
    chain.fixtures === 1 ? '1 fixture' : `${chain.fixtures} fixtures`,
  ];
  return `${parts.join(' and ')} reach ${endName(chain.root.end)}.`;
}

function ChainRow({ node, onOpen }: { node: ChainNode; onOpen?: (key: string) => void }) {
  return (
    <li
      className={cn('relative flex h-12 items-center pr-3', node.depth === 0 && 'bg-app-accent/5')}
      style={{ paddingLeft: `calc(${node.depth} * 1.25rem + 0.75rem)` }}
    >
      {node.depth > 0 ? (
        <span
          aria-hidden
          className="absolute top-0 bottom-1/2 w-2.5 rounded-bl-sm border-b border-l border-border"
          style={{ left: `calc(${node.depth - 1} * 1.25rem + 1.6rem)` }}
        />
      ) : null}
      <EndCell end={node.end} onOpen={onOpen} />
    </li>
  );
}

/** Props for {@link ChainPanel}. */
export interface ChainPanelProps {
  chain: Chain;
  onClose?: () => void;
  onOpen?: (key: string) => void;
  className?: string;
}

/** The trace pane. */
export function ChainPanel({ chain, onClose, onOpen, className }: ChainPanelProps) {
  const nodes = flatten(chain.root);
  return (
    <aside
      aria-label={`Chain from ${endName(chain.root.end)}`}
      className={cn(
        'flex min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-lg border bg-card',
        className
      )}
    >
      <header className="flex items-start gap-2 border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Chain from {endName(chain.root.end)}</h2>
          <p className="text-xs text-muted-foreground">{reach(chain)}</p>
        </div>
        <HintTooltip label="Close the chain" shortcutId="dismiss">
          <ButtonPrimitive
            variant="ghost"
            size="icon-sm"
            aria-label="Close the chain"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </ButtonPrimitive>
        </HintTooltip>
      </header>
      <ol aria-label="Reachable from here" className="min-h-0 flex-1 overflow-y-auto py-1">
        {nodes.map((node) => (
          <ChainRow key={node.key} node={node} onOpen={onOpen} />
        ))}
      </ol>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Fixtures end a chain: two things on one outlet are not connected to each other.
      </p>
    </aside>
  );
}
