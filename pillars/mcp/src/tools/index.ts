import { cerebrumTools } from './cerebrum.js';
import { financeTools } from './finance.js';
import { fixtureTools } from './inventory-fixtures.js';
import { inventoryTools } from './inventory.js';
import { mediaTools } from './media.js';

import type { ToolDef } from './tool-def.js';

export type { ToolDef } from './tool-def.js';

export const allTools: readonly ToolDef[] = [
  ...inventoryTools,
  ...fixtureTools,
  ...financeTools,
  ...mediaTools,
  ...cerebrumTools,
];
