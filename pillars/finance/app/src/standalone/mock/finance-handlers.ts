import { accountHandlers } from './finance/accounts';
import { importHandlers } from './finance/imports';
import { ledgerHandlers } from './finance/ledger';
import { ruleHandlers } from './finance/rules';

import type { MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

/**
 * One handler per operation finance's own OpenAPI document declares, served
 * under `/finance-api`.
 *
 * Every operation, not only the ones the pages read on load: the coverage test
 * compares these keys against the committed contract in both directions, so a
 * new endpoint cannot ship without an answer here and a handler cannot outlive
 * the operation it answers. Split by area only to keep each file readable.
 */
export const financeHandlers: MockHandlers = {
  ...accountHandlers,
  ...ledgerHandlers,
  ...ruleHandlers,
  ...importHandlers,
};
