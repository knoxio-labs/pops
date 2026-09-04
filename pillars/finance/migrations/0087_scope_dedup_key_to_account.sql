-- POPS-2773. Scopes the import dedup key to the account.
--
-- `src/contract/import-dedup.ts` built the checksum from date, amount,
-- normalised description and bank reference, deliberately excluding the
-- account — harmless while every transaction shared one account family, but
-- wrong now that `accounts` (POPS-2767) are real, distinct records: two
-- accounts can legitimately hold an identical row (the same subscription
-- billed to two cards on the same day), and an importer that lands
-- counterpart legs on the same date/amount but a different account (e.g. the
-- ANZ checking importer, POPS-2751) must not collide with the leg it is
-- paired with.
--
-- Every stored checksum is recomputed via `finance_account_scoped_checksum()`,
-- the SQLite function registered in open-finance-db.ts before migrate() runs;
-- it derives the exact key the browser parser now hashes (see
-- `buildImportDedupKeyFromStoredRow`), scoped to `transactions.account` — the
-- same free-text bank/account name the parser has at hand, not `account_id`
-- (see import-dedup.ts's module doc comment for why the id itself is not
-- available to the pure key builder). An existing row and a re-import of the
-- same charge for the same account collide; the same charge re-imported
-- under a different account no longer does.
--
-- `amount_cents` (integer cents since `0064`) is passed straight through; the
-- SQL function converts it back to the decimal-dollar amount the checksum has
-- always been keyed on before hashing.
--
-- This is id-matched (each row recomputes its own checksum from its own
-- columns, keyed by rowid, no join) and idempotent: `finance_account_scoped_checksum`
-- is a pure function of already-stored columns, so re-running this migration
-- (e.g. against a fresh install replaying the full journal) always converges
-- on the same values. `idx_transactions_checksum` is already a plain
-- (non-unique) index as of `0059`, so no index changes are needed here.

UPDATE `transactions`
SET `checksum` = finance_account_scoped_checksum(`date`, `amount_cents`, `description`, `raw_row`, `account`)
WHERE `checksum` IS NOT NULL;
