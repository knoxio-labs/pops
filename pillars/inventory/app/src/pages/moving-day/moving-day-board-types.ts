import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { BoxAction } from './moving-day-actions.js';
import type { MovingBox, MovingDayData, MovingDayView } from './moving-day-model.js';

/** Props shared by moving-day boards that display boxes. */
export interface MovingBoxBoardProps {
  readonly data: MovingDayData;
  readonly world: PlacementWorld;
  readonly selectedId: string | null;
  readonly pendingIds: ReadonlySet<string>;
  readonly disabledReason: string | undefined;
  readonly rejections: Readonly<Record<string, string>>;
  readonly onAction: (box: MovingBox, action: BoxAction) => void;
  readonly onOpenBox: (id: string) => void;
}

/** Props for the moving-day board switcher. */
export interface MovingDayBoardProps extends MovingBoxBoardProps {
  readonly view: MovingDayView;
  readonly query: string;
  readonly onPack: (ids: readonly string[]) => void;
  readonly onClearSearch: () => void;
}

/** Props for the moving-day toolbar. */
export interface MovingDayToolbarProps {
  readonly data: MovingDayData;
  readonly view: MovingDayView;
  readonly query: string;
  readonly onViewChange: (view: MovingDayView) => void;
  readonly onQueryChange: (query: string) => void;
}
