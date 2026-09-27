import { cn } from '@pops/ui';

import { MovingDayBoxCard } from './moving-day-box-card.js';
import { boxesByStage, type MovingBoxStage } from './moving-day-model.js';

import type { ReactNode } from 'react';

import type { MovingBoxBoardProps } from './moving-day-board-types.js';

const STAGE_COPY: Readonly<
  Record<MovingBoxStage, { readonly title: string; readonly hint: string; readonly empty: string }>
> = {
  packing: { title: 'Packing', hint: 'Open, with room left', empty: 'No box is being packed.' },
  full: {
    title: 'Full, not closed',
    hint: 'Close these next',
    empty: 'Nothing is waiting to be closed.',
  },
  closed: { title: 'Closed', hint: 'Taped and ready to go', empty: 'No box is closed yet.' },
};

/** Renders a board column with a heading, hint, count, and scrollable content. */
export function BoardColumn({
  title,
  hint,
  count,
  highlight = false,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly count: number;
  readonly highlight?: boolean;
  readonly children: ReactNode;
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

/** Renders boxes in their packing stages. */
export function StageBoard(props: MovingBoxBoardProps) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
      {boxesByStage(props.data.boxes).map(({ stage, boxes }) => {
        const copy = STAGE_COPY[stage];
        return (
          <BoardColumn
            key={stage}
            title={copy.title}
            hint={copy.hint}
            count={boxes.length}
            highlight={stage === 'full' && boxes.length > 0}
          >
            {boxes.length === 0 ? (
              <li className="px-1 py-2 text-xs text-muted-foreground">{copy.empty}</li>
            ) : null}
            {boxes.map((box) => (
              <MovingDayBoxCard
                key={box.id}
                box={box}
                world={props.world}
                selected={props.selectedId === box.id}
                pending={props.pendingIds.has(box.id)}
                disabledReason={props.disabledReason}
                rejection={props.rejections[box.id]}
                onAction={(action) => props.onAction(box, action)}
                onOpen={() => props.onOpenBox(box.id)}
              />
            ))}
          </BoardColumn>
        );
      })}
    </div>
  );
}
