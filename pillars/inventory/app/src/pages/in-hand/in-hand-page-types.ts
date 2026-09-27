import type { planPutBackAll } from '../../foundation/in-hand/in-hand-model.js';
import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { BulkResult } from '../../inventory-web/item-verbs-bulk-types.js';
import type { ChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import type { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import type { ItemRows } from '../../inventory-web/useWebItems.js';

/** The body state used while the in-hand query settles. */
export type InHandBodyState = 'loading' | 'error' | 'list';

/** The inline refusal state owned by the in-hand page. */
export interface InHandRejections {
  readonly values: Readonly<Record<string, string>>;
  readonly clear: (ids: readonly string[]) => void;
  readonly set: (id: string, reason: string) => void;
  readonly applyBulk: (ids: readonly string[], result: BulkResult) => void;
}

/** All read state and derived placement data needed by the in-hand view. */
export interface InHandPageData {
  readonly online: boolean;
  readonly itemRows: ItemRows;
  readonly pendingIds: ReadonlySet<string>;
  readonly items: readonly ItemRowModel[];
  readonly itemIds: readonly string[];
  readonly selection: SelectionApi;
  readonly placement: ReturnType<typeof usePlacementSources>;
  readonly world: PlacementWorld;
  readonly changed: ChangedElsewhere;
  readonly disabledReason: string | undefined;
  readonly body: InHandBodyState;
  readonly plan: ReturnType<typeof planPutBackAll>;
  readonly rejections: InHandRejections;
}
