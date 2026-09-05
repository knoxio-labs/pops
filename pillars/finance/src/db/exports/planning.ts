/**
 * The forward-looking tables — budgets and the wish list — plus the shared
 * saved-search filters that scope every list view over them.
 *
 * One of the groups re-exported by `../index.ts` — see that file's header for
 * why the barrel is split rather than flat.
 */
export * as budgetsService from '../services/budgets.js';

export type {
  BudgetRow,
  BudgetWithSpend,
  BudgetListResult,
  CreateBudgetInput,
  UpdateBudgetInput,
  ListBudgetsOptions,
} from '../services/budgets.js';

export * as wishListService from '../services/wishlist.js';

export {
  WISH_LIST_PRIORITIES,
  type WishListPriority,
  type WishListRow,
  type CreateWishListItemInput,
  type UpdateWishListItemInput,
  type WishListListResult,
  type WishListQuery,
} from '../services/wishlist.js';

export { searchFilterScope } from '../services/search-filters.js';

export type {
  SearchFilter,
  FinanceSearchScope,
  TransactionsSearchScope,
  BudgetsSearchScope,
  WishlistSearchScope,
  SearchScopeResult,
} from '../services/search-filters.js';
