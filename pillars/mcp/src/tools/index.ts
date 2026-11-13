import { bfmTools } from './bfm.js';
import { cerebrumTools } from './cerebrum.js';
import { contactsTools } from './contacts.js';
import { documentsOwnerTools } from './documents-owner.js';
import { documentTools } from './documents.js';
import { financeTools } from './finance.js';
import { fixtureTools } from './inventory-fixtures.js';
import { inventoryTools } from './inventory.js';
import { mediaTools } from './media.js';
import { purchasesTools } from './purchases.js';
import { tagsTools } from './tags.js';
import { tripsTools } from './trips.js';

import type { ToolDef } from './tool-def.js';

export type { ToolDef } from './tool-def.js';

export const allTools: readonly ToolDef[] = [
  ...bfmTools,
  ...inventoryTools,
  ...documentTools,
  ...documentsOwnerTools,
  ...fixtureTools,
  ...financeTools,
  ...mediaTools,
  ...cerebrumTools,
  ...contactsTools,
  ...purchasesTools,
  ...tagsTools,
  ...tripsTools,
];
