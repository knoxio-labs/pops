/**
 * Boxes as three columns, in the order a box goes through them: still
 * packing, full and waiting to be closed, closed. Each column scrolls on
 * its own; the full column is the to-do list.
 */
import { cn } from '@pops/ui';

import { BoxCard } from './box-card';
import { boxesByStage } from './moving-model';

import type { ReactNode } from 'react';

import type { PlacementWorld } from '../foundation';
import type { BoxAction } from './box-actions';
import type { BoxStage, BoxSummary } from './moving-model';

const STAGE_COPY: Readonly<Record<BoxStage, { title: string; hint: string; empty: string }>> = {
  packing: { title: 'Packing', hint: 'Open, with room left', empty: 'No box is being packed.' },
  full: {
    title: 'Full, not closed',
    hint: 'Close these next',
    empty: 'Nothing is waiting to be closed.',
  },
  closed: { title: 'Closed', hint: 'Taped and ready to go', empty: 'No box is closed yet.' },
};

/** Props for {@link StageBoard} and the other boards. */
export interface BoardProps {
  world: PlacementWorld;
  boxes: readonly BoxSummary[];
  selectedId?: string | null;
  onAction: (id: string, action: BoxAction) => void;
  onOpenBox: (id: string) => void;
}

/** A board column: title, count, one line of why, and a scrolling list. */
export function BoardColumn({
  title,
  hint,
  count,
  highlight = false,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-h-0 flex-col rounded-xl border bg-muted/40',
        highlight && 'border-app-accent/50 bg-app-accent/5'
      )}
    >
      <header className="px-3 pt-2.5 pb-2">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold">
          <span className="truncate">{title}</span>
          <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
        </h2>
        {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
      </header>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">{children}</ul>
    </section>
  );
}

/** The stage board. */
export function StageBoard({ world, boxes, selectedId, onAction, onOpenBox }: BoardProps) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
      {boxesByStage(boxes).map(({ stage, boxes: column }) => {
        const copy = STAGE_COPY[stage];
        return (
          <BoardColumn
            key={stage}
            title={copy.title}
            hint={copy.hint}
            count={column.length}
            highlight={stage === 'full' && column.length > 0}
          >
            {column.length === 0 ? (
              <li className="px-1 py-2 text-xs text-muted-foreground">{copy.empty}</li>
            ) : null}
            {column.map((summary) => (
              <BoxCard
                key={summary.box.id}
                summary={summary}
                world={world}
                selected={selectedId === summary.box.id}
                onAction={(action) => onAction(summary.box.id, action)}
                onOpen={() => onOpenBox(summary.box.id)}
              />
            ))}
          </BoardColumn>
        );
      })}
    </div>
  );
}
