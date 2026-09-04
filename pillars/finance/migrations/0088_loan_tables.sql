-- POPS-2829. Storage for a `loan`-kind account, which this ticket also
-- promotes out of `ACCOUNT_KINDS`' reserved set into `DAY_ONE_ACCOUNT_KINDS`.
--
-- Three tables, not one, because the three things have different
-- cardinalities against one loan account:
--   * `loan_terms` — exactly one row (PK is `account_id` itself, the same
--     shape `account_gift_card_details` uses in 0084: there is nothing a
--     synthetic id would disambiguate).
--   * `loan_rate_history` — many rows over time; the current rate is the
--     latest by `effective_from`.
--   * `loan_offset_links` — many rows, because a mortgage package can carry
--     several offset accounts, and the link is temporal (`unlinked_at`), so
--     it cannot be a column on `loan_terms`.
--
-- `loan_terms.annual_rate_pct` is a REAL COLUMN, not a derived read of
-- `loan_rate_history`'s latest row. It is the "current rate" convenience
-- field, and `src/db/services/loan-terms.ts` keeps it in step by writing
-- both sides in one transaction and refusing any rate whose `effective_from`
-- is not strictly later than every row already stored — so the column can
-- never fall behind history. Backdated rate corrections are therefore not
-- possible yet; that is a deliberate simplification recorded here so a later
-- ticket that needs them knows this is the constraint to lift, not a bug.
--
-- Money is integer cents (#3665, CF041), matching `transactions.amount_cents`
-- and `budgets.amount_cents`; the decimal-dollar form exists only at the wire
-- edge. `annual_rate_pct` is a REAL percentage (5.49 means 5.49% p.a.), not
-- cents and not a fraction.
--
-- There is no SQL CHECK constraining `accounts.kind = 'loan'` for a
-- referencing row — SQLite cannot express a cross-table check against another
-- row's column — so, exactly as 0084 does for gift cards, that invariant is
-- enforced at the service layer instead.
--
-- `loan_offset_links.offset_account_id` is deliberately NOT restricted to a
-- kind: an offset can be a checking or savings account, and nothing in the
-- ledger breaks if it is something else.

CREATE TABLE `loan_terms` (
	`account_id` text PRIMARY KEY NOT NULL,
	`original_principal_cents` integer NOT NULL,
	`annual_rate_pct` real NOT NULL,
	`term_months` integer NOT NULL,
	`monthly_repayment_cents` integer NOT NULL,
	`started_on` text NOT NULL,
	`terms_effective_from` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loan_rate_history` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_account_id` text NOT NULL,
	`annual_rate_pct` real NOT NULL,
	`effective_from` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`loan_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loan_offset_links` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_account_id` text NOT NULL,
	`offset_account_id` text NOT NULL,
	`linked_from` text NOT NULL,
	`unlinked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`loan_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`offset_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- The current rate is `ORDER BY effective_from DESC LIMIT 1` per loan, and
-- every rate write reads that same row back to reject a non-latest insert.
CREATE INDEX `idx_loan_rate_history_account_effective` ON `loan_rate_history` (`loan_account_id`,`effective_from`);
--> statement-breakpoint
CREATE INDEX `idx_loan_offset_links_loan` ON `loan_offset_links` (`loan_account_id`);
--> statement-breakpoint
-- PARTIAL unique index: at most one ACTIVE link per (loan, offset) pair,
-- while every closed link stays on the table. A plain unique index would
-- make re-linking an account that was previously unlinked impossible, which
-- is the whole point of `unlinked_at` being a timestamp rather than a delete.
CREATE UNIQUE INDEX `idx_loan_offset_links_active_pair` ON `loan_offset_links` (`loan_account_id`,`offset_account_id`) WHERE `unlinked_at` IS NULL;
