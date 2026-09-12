/**
 * The summary endpoint's window vocabulary (POPS-3589, POPS-250 decision 1).
 *
 * Dependency-free, like `corrections-constants.ts`, so both the REST zod
 * schemas and the db-side window resolver can import it without either
 * depending on the other.
 *
 * `30d` is the default and is a rolling window on purpose: a calendar month
 * renders blank for the first days of every month and for as long as any
 * import lags, which is what made three of the old dashboard's four tiles read
 * `$0.00`.
 */
export const SUMMARY_WINDOWS = ['30d', '90d', 'month', 'year', 'all'] as const;

/** One of {@link SUMMARY_WINDOWS}. */
export type SummaryWindowKey = (typeof SUMMARY_WINDOWS)[number];

/** The window a caller gets when none is named — never a calendar month. */
export const DEFAULT_SUMMARY_WINDOW: SummaryWindowKey = '30d';

/** Rows returned in each of the tag and entity breakdowns when unspecified. */
export const DEFAULT_SUMMARY_TOP_LIMIT = 10;

/** Hard cap on `topLimit`, so an agent cannot ask for the whole vocabulary. */
export const MAX_SUMMARY_TOP_LIMIT = 50;
