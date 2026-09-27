import { Search } from 'lucide-react';

import { Input } from '@pops/ui';

import { Segmented } from '../../foundation/frame/segmented.js';
import { DestinationBoard } from './moving-day-destination-board.js';
import { FindResults } from './moving-day-find-results.js';
import { LooseBoard } from './moving-day-loose-board.js';
import { StageBoard } from './moving-day-stage-board.js';

import type { MovingDayBoardProps, MovingDayToolbarProps } from './moving-day-board-types.js';

/** Renders the moving-day segmented view and search field. */
export function MovingDayToolbar({
  data,
  view,
  query,
  onViewChange,
  onQueryChange,
}: MovingDayToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        label="View boxes"
        value={view}
        onChange={onViewChange}
        segments={[
          { id: 'stage', label: 'By stage' },
          { id: 'destination', label: 'By destination' },
          {
            id: 'loose',
            label: 'Not packed',
            count: data.looseCount + data.inHand.length,
            alert: true,
          },
        ]}
      />
      <div className="relative min-w-64 flex-1 md:ml-auto md:max-w-96">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Which box is it in?"
          placeholder="Which box is it in? Type a thing or a box"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="pl-8"
        />
      </div>
    </div>
  );
}

/** Chooses the board mode or search result view. */
export function MovingDayBoard(props: MovingDayBoardProps) {
  if (props.query.trim().length > 0)
    return <FindResults {...props} onClear={props.onClearSearch} />;
  if (props.view === 'destination') return <DestinationBoard {...props} />;
  if (props.view === 'loose') {
    return (
      <LooseBoard
        data={props.data}
        disabledReason={props.disabledReason}
        rejections={props.rejections}
        onPack={props.onPack}
      />
    );
  }
  return <StageBoard {...props} />;
}

export { BoardColumn, StageBoard } from './moving-day-stage-board.js';
export { DestinationBoard } from './moving-day-destination-board.js';
export { FindResults } from './moving-day-find-results.js';
export { LooseBoard } from './moving-day-loose-board.js';
export { MovingDayBoxCard } from './moving-day-box-card.js';
export { MovingDaySummary } from './moving-day-summary.js';
export type {
  MovingBoxBoardProps,
  MovingDayBoardProps,
  MovingDayToolbarProps,
} from './moving-day-board-types.js';
