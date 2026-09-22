import { catalogueTools } from './inventory-catalogue.js';
import { connectionTools } from './inventory-connections.js';
import { itemTools } from './inventory-items.js';
import { lifecycleTools } from './inventory-lifecycle.js';
import { locationTools } from './inventory-locations.js';
import { placementTools } from './inventory-placement.js';

import type { ToolDef } from './index.js';

export const inventoryTools: readonly ToolDef[] = [
  ...catalogueTools,
  ...locationTools,
  ...itemTools,
  ...connectionTools,
  ...placementTools,
  ...lifecycleTools,
];
