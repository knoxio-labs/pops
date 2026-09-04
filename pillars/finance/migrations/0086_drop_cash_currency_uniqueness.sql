-- POPS-2775 (accounts list/form design review) reverses 0083's
-- `idx_accounts_kind_currency_cash` constraint: the epic's own ticket text is
-- explicit that a second `cash` account sharing a currency is not an error
-- ("think a piggy bank" — a household can keep more than one physical cash
-- stash in the same currency, same as it can hold more than one credit card).
-- Drop the partial unique index; `cash` now behaves like every other
-- non-`person` kind with no currency-scoped uniqueness at all.
DROP INDEX `idx_accounts_kind_currency_cash`;
