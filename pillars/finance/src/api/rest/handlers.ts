/**
 * ts-rest handler composer for the finance pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<FinanceRestContract>` that
 * `createExpressEndpoints` consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { financeContract } from '../../contract/rest.js';
import { type OpenedFinanceDb } from '../../db/index.js';
import { type ContactsClient } from '../contacts/client.js';
import { makeAccountImportsHandlers } from './account-imports-handlers.js';
import { makeAccountsHandlers } from './accounts-handlers.js';
import { makeBudgetsHandlers } from './budgets-handlers.js';
import { makeCheckpointsHandlers } from './checkpoints-handlers.js';
import { makeCorrectionsHandlers } from './corrections-handlers.js';
import { makeCurrenciesHandlers } from './currencies-handlers.js';
import { makeDataQualityHandlers } from './data-quality-handlers.js';
import { makeEntityUsageHandlers } from './entity-usage-handlers.js';
import { makeGiftCardDetailsHandlers } from './gift-card-details-handlers.js';
import { makeImportsHandlers } from './imports-handlers.js';
import { makeInstitutionsHandlers } from './institutions-handlers.js';
import { makeLoanHandlers } from './loan-handlers.js';
import { makeSearchHandlers } from './search-handlers.js';
import { makeSettingsHandlers } from './settings-handlers.js';
import { makeTagRulesHandlers } from './tag-rules-handlers.js';
import { makeTransactionsHandlers } from './transactions-handlers.js';
import { makeWishlistHandlers } from './wishlist-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeFinanceRestHandlers(deps: {
  financeDb: OpenedFinanceDb;
  contacts: ContactsClient;
}): ReturnType<typeof server.router<typeof financeContract>> {
  const db = deps.financeDb.db;
  return server.router(financeContract, {
    wishlist: makeWishlistHandlers(db),
    budgets: makeBudgetsHandlers(db),
    currencies: makeCurrenciesHandlers(db),
    institutions: makeInstitutionsHandlers(db),
    accounts: makeAccountsHandlers(db, deps.contacts),
    checkpoints: makeCheckpointsHandlers(db),
    accountImports: makeAccountImportsHandlers(db, deps.contacts),
    giftCardDetails: makeGiftCardDetailsHandlers(db),
    loan: makeLoanHandlers(db),
    transactions: makeTransactionsHandlers(db, deps.contacts),
    tagRules: makeTagRulesHandlers(db),
    corrections: makeCorrectionsHandlers(db),
    entityUsage: makeEntityUsageHandlers(db, deps.contacts),
    imports: makeImportsHandlers(db, deps.contacts),
    search: makeSearchHandlers(db),
    settings: makeSettingsHandlers(db),
    dataQuality: makeDataQualityHandlers(db),
  });
}
