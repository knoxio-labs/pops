/**
 * Account identity and the reference data hanging off it: the accounts table
 * itself, merges, name/id lookup, entity display, and the per-account-kind
 * detail tables (currencies, institutions, logos, gift cards, loans).
 *
 * Balances and checkpoints are deliberately NOT here — they are their own
 * group in `./account-balances.ts`, because they are the half that grows.
 *
 * One of the groups re-exported by `../index.ts` — see that file's header for
 * why the barrel is split rather than flat.
 */
export * as accountsService from '../services/accounts.js';

export type {
  AccountListResult,
  AccountReorderEntry,
  AccountRow,
  CreateAccountInput,
  CreateAccountOptions,
  ListAccountsOptions,
  UpdateAccountInput,
} from '../services/accounts.js';

export {
  mergeAccounts,
  previewAccountMerge,
  type AccountMergePreview,
} from '../services/merge-accounts.js';

export { resolveAccountIdByName, resolveImportAccountId } from '../services/account-lookup.js';

export { resolvePendingPersonAccountEntity } from '../services/account-entity-resolution.js';

export { resolveAccountEntityDisplays } from '../services/account-entity-display.js';

export type {
  AccountEntityDisplay,
  AccountIssuerInstitution,
  InstitutionsById,
} from '../services/account-entity-display.js';

export * as currenciesService from '../services/currencies.js';

export type {
  CurrencyRow,
  CreateCurrencyInput,
  UpdateCurrencyInput,
} from '../services/currencies.js';

export * as institutionsService from '../services/institutions.js';

export type {
  InstitutionRow,
  CreateInstitutionInput,
  UpdateInstitutionInput,
} from '../services/institutions.js';

export * as logoBlobsService from '../services/logo-blobs.js';

export type { LogoBlobRow, CreateLogoBlobInput } from '../services/logo-blobs.js';

export * as giftCardDetailsService from '../services/gift-card-details.js';

export type {
  GiftCardDetailsRow,
  WriteGiftCardDetailsInput,
  RevealedGiftCardSecret,
  ExpiringGiftCard,
} from '../services/gift-card-details.js';

export * as loanTermsService from '../services/loan-terms.js';

export type {
  LoanTermsRow,
  LoanRateHistoryRow,
  WriteLoanTermsInput,
  RecordLoanRateInput,
} from '../services/loan-terms.js';

export * as loanOffsetLinksService from '../services/loan-offset-links.js';

export type { LoanOffsetLinkRow, LinkOffsetAccountInput } from '../services/loan-offset-links.js';
