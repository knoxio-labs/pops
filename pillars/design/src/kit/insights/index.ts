import { assetModules } from './asset';
import { liabilityModules } from './liability';
import { storedValueModules } from './stored-value';

import type { AccountKind } from '@/fixtures/account-kinds';

import type { InsightModule } from './contract';

export type { InsightModule, InsightModules } from './contract';

/**
 * Every kind's dashboard modules, merged from the three files that own them.
 * A kind with no entry gets a dashboard of the parts every account has, which
 * is the honest outcome for a kind nothing specific has been designed for yet.
 */
export function modulesFor(kind: AccountKind): InsightModule[] {
  return assetModules[kind] ?? liabilityModules[kind] ?? storedValueModules[kind] ?? [];
}
