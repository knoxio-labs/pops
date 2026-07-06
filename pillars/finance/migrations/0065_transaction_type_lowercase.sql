-- #3607 stage 2 (finance-audit epic #3606): `transactions.type` previously stored
-- the capitalized display strings `Expense`/`Income`/`Transfer` written by the
-- (now-deleted) `deriveTransactionType`/`deriveNewType` collapse functions. As of
-- this stage the column stores the canonical lowercase taxonomy verbatim
-- (`purchase`/`transfer`/`income`/... — see `TRANSACTION_TYPES`), matching the
-- `transaction_corrections.transaction_type` enum. This backfills every legacy
-- row: `Transfer -> transfer`, `Income -> income`, and everything else
-- (`Expense`, the empty-string default, any stray value) -> `purchase`, the
-- default debit type.
--
-- The drizzle `{ enum }` on the column is type-level only (no SQL CHECK), so no
-- table rebuild is needed — only the stored values change.
--
-- Idempotent by construction: a row already carrying a valid lowercase taxonomy
-- value is left untouched by the CASE, so re-running is a no-op (and the
-- migrator's `__drizzle_migrations` bookkeeping skips an already-applied tag
-- anyway). REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy) — this rewrites the `type` of every existing
-- transaction. Rollback = restore the snapshot.
UPDATE `transactions` SET `type` = CASE
	WHEN `type` = 'Transfer' THEN 'transfer'
	WHEN `type` = 'Income' THEN 'income'
	WHEN `type` IN ('purchase', 'transfer', 'income', 'refund', 'reversal', 'loan', 'rebate', 'tax') THEN `type`
	ELSE 'purchase'
END;
