-- POPS-2852. Re-scopes the import dedup key from the bank/dialect label to the
-- real account id.
--
-- `0087_scope_dedup_key_to_account` scoped the checksum to
-- `transactions.account` — the free-text bank/dialect label picked to select
-- a CSV parser (e.g. "ANZ Credit Card"), not `accounts.id`. That was the best
-- available identity at the time: the import wizard had no real account until
-- commit, so the dialect label was the only stable, pre-commit stand-in. It
-- was wrong the moment two real accounts could share one dialect — two ANZ
-- credit cards, say — because the same charge on both would collide onto one
-- checksum and only one would ever commit.
--
-- `0083_accounts`/POPS-2840 gave the wizard a real `accountId` before parsing
-- even starts (the account-step is now the wizard's first step), which is
-- what lets this migration re-key on `transactions.account_id` instead.
--
-- Every stored checksum is recomputed via `finance_account_id_scoped_checksum()`,
-- the SQLite function registered in open-finance-db.ts before migrate() runs;
-- it derives the exact key the browser parser now hashes (see
-- `buildImportDedupKeyFromStoredRow`), scoped to `transactions.account_id`. An
-- existing row and a re-import of the same charge for the same real account
-- collide; the same charge re-imported under a different real account no
-- longer does, even when both accounts share a bank dialect.
--
-- `amount_cents` (integer cents since `0064`) is passed straight through; the
-- SQL function converts it back to the decimal-dollar amount the checksum has
-- always been keyed on before hashing.
--
-- This is id-matched (each row recomputes its own checksum from its own
-- columns, keyed by rowid, no join) and idempotent: `finance_account_id_scoped_checksum`
-- is a pure function of already-stored columns, so re-running this migration
-- (e.g. against a fresh install replaying the full journal) always converges
-- on the same values. `idx_transactions_checksum` is already a plain
-- (non-unique) index as of `0059`, so no index changes are needed here.

UPDATE `transactions`
SET `checksum` = finance_account_id_scoped_checksum(`date`, `amount_cents`, `description`, `raw_row`, `account_id`)
WHERE `checksum` IS NOT NULL;
