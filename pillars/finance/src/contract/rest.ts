/**
 * REST contract for the finance pillar — ts-rest single source of truth.
 *
 * Composes the domain sub-routers (wishlist, budgets, accounts, currencies,
 * institutions, transactions, tagRules, corrections, imports) into the
 * public wire surface.
 * `generateOpenApi(financeContract, …)` projects this to
 * `openapi/finance.openapi.json`; `openapi-typescript` then projects the
 * JSON to `src/contract/api-types.generated.ts`.
 *
 * This is the ONLY description of the finance wire format. Don't hand-author
 * OpenAPI or hand-author paths anywhere else.
 */
import { initContract } from '@ts-rest/core';

import { financeAccountsContract } from './rest-accounts.js';
import { financeBudgetsContract } from './rest-budgets.js';
import { financeCorrectionsContract } from './rest-corrections.js';
import { financeCurrenciesContract } from './rest-currencies.js';
import { financeEntityUsageContract } from './rest-entity-usage.js';
import { financeImportsContract } from './rest-imports.js';
import { financeInstitutionsContract } from './rest-institutions.js';
import { financeSearchContract } from './rest-search.js';
import { financeSettingsContract } from './rest-settings.js';
import { financeTagRulesContract } from './rest-tag-rules.js';
import { financeTransactionsContract } from './rest-transactions.js';
import { financeWishlistContract } from './rest-wishlist.js';

const c = initContract();

export const financeContract = c.router(
  {
    wishlist: financeWishlistContract,
    budgets: financeBudgetsContract,
    currencies: financeCurrenciesContract,
    institutions: financeInstitutionsContract,
    accounts: financeAccountsContract,
    transactions: financeTransactionsContract,
    tagRules: financeTagRulesContract,
    corrections: financeCorrectionsContract,
    entityUsage: financeEntityUsageContract,
    imports: financeImportsContract,
    search: financeSearchContract,
    settings: financeSettingsContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type FinanceRestContract = typeof financeContract;
