import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** Context shared by the Overview panels' row verbs. */
export interface PanelContext {
  world: PlacementWorld;
  disabledReason?: string;
  onNavigate: (path: string) => void;
}
