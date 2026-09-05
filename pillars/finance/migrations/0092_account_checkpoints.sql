-- POPS-2878 / ADR-051. `account_checkpoints`: a balance that was true for an
-- account on a date, read off something outside the ledger.
--
-- ADR-050 held that "an account's balance is always the sum of the
-- transactions it carries, never a stored number that can drift from that
-- sum". That is only true of an account whose history is complete from
-- inception. None of ours are: the ANZ credit card's import starts on
-- 2026-06-01, mid-history, so summing it reads +$780.64 — net flow since an
-- arbitrary Tuesday, not a balance. ADR-051 amends that sentence: the balance
-- is the nearest checkpoint plus the transactions since it, and the EARLIEST
-- checkpoint is the opening balance. There is still no opening-balance
-- column, here or on `accounts` — one would be a second, worse spelling of
-- the same row.
--
-- `balance_cents` is LEDGER-SIGNED, exactly like `transactions.amount_cents`
-- (#3665, CF041): positive is money held, negative is money owed, for assets
-- and liabilities alike. A card owing $2,137.55 stores `-213755`. The
-- "amount owed" phrasing is a UI translation at the edge and never reaches
-- this table.
--
-- `as_of` is an END-OF-DAY figure: every transaction dated `<= as_of` is
-- already inside the balance. `transactions.date` carries no time and no
-- posting date, so any finer boundary would be a fiction — which is also why
-- a statement's closing balance is expected to disagree with the ledger by
-- whatever straddles the boundary until those rows land.
--
-- The `ON DELETE CASCADE` is deliberate and unlike every other foreign key in
-- this pillar, which all use `no action`. The only hard delete of an account
-- is the merge path (`src/db/services/merge-accounts.ts`), and POPS-2883
-- repoints these rows onto the surviving account before it deletes; the
-- cascade is the backstop for a delete arriving some other way. An orphaned
-- checkpoint is not a record worth keeping — it would make the anchor lookup
-- answer for an account that no longer exists.
--
-- There is no `updated_at` and no service primitive that writes one. Rows are
-- append-only: a checkpoint is a fact about a moment, and a corrected count is
-- a new fact rather than an edit. Only `manual` rows may be deleted.

CREATE TABLE `account_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`as_of` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Every read is "this account's checkpoints by date": the history list, and
-- both directions of the anchor lookup (nearest at-or-before a date, earliest
-- after it).
CREATE INDEX `idx_account_checkpoints_account_as_of` ON `account_checkpoints` (`account_id`,`as_of`);
--> statement-breakpoint
-- PARTIAL unique index, excluding `manual`. Re-importing the same statement
-- must not double a checkpoint, so the machine sources are unique per
-- (account, date, source). A second hand count on the same day is a new fact,
-- not a duplicate — it stays legal, and the newest `created_at` wins.
CREATE UNIQUE INDEX `idx_account_checkpoints_machine_source` ON `account_checkpoints` (`account_id`,`as_of`,`source`) WHERE `source` != 'manual';
