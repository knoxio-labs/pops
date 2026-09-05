/**
 * Backend-safe barrel for the finance domain's persistence layer.
 *
 * Hosts finance-owned tables (accounts, transactions, budgets, wish list, tag
 * rules, tag vocabulary, corrections) and re-exports each table's service plus
 * its row/input types from a single entry point. Every consumer still imports
 * from here; the grouping below is internal to `db/`.
 *
 * WHY THIS FILE IS A LIST OF GROUPS AND NOT A LIST OF SERVICES. oxlint caps
 * every linted file at 200 counted lines (`max-lines`, blanks and comments
 * skipped). Flat, this barrel reached exactly 200 — one added export line was
 * a lint failure, and because two branches can each add one without either
 * seeing the other's, it was a lint failure that surfaced inside the merge
 * queue rather than on a PR: three merge groups were ejected on
 * `pillars/finance/src/db/index.ts:269:39 File has too many lines (201)` on
 * 2026-09-05, with nothing showing on any of the PRs in them (POPS-3026).
 * Buying two lines back by deleting unused re-exports had already been tried
 * once and was consumed again within days.
 *
 * So the barrel is split along the seam the services already have, one file
 * per domain under `./exports/`. A new service is added to its group, not to
 * this file, and this file only grows when finance gains a whole new domain.
 * DO NOT re-flatten it: inlining these eight lines restores a file that is one
 * export away from its cap and hides the next collision in the merge queue
 * again.
 */
export * from './exports/core.js';
export * from './exports/accounts.js';
export * from './exports/account-balances.js';
export * from './exports/transactions.js';
export * from './exports/tagging.js';
export * from './exports/imports.js';
export * from './exports/entities.js';
export * from './exports/planning.js';
