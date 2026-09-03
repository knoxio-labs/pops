-- POPS-2767 (design-reviewed on the accounts epic POPS-2749). Introduces the
-- `accounts` table and gives every transaction an `account_id`.
--
-- `accounts.institution` and `accounts.currency` were originally scoped as a
-- nullable free-text column and a checked ISO-4217 string respectively.
-- Design review on POPS-2765/POPS-2803 rejected both: `institution_id` is a
-- nullable FK onto `institutions` (POPS-2803) so the account chip can key off
-- an institution's logo/colour instead of parsing a string, and `currency` is
-- a FK onto `currencies` (POPS-2802) so a rewards-points account can be
-- denominated in something with no ISO 4217 code. `kind` stays a plain text
-- column with no SQL CHECK — drizzle's `{ enum }` is type-level only, the same
-- convention `transactions.type` already uses (see 0065's header) — validated
-- at the contract boundary against `ACCOUNT_KINDS`
-- (`src/contract/account-kind.ts`) instead. There is no opening-balance
-- column of any kind; that tension was resolved against inline
-- opening-balance fields during design review.
--
-- `idx_accounts_kind_currency_cash` is a partial UNIQUE index scoped to
-- `kind = 'cash'`: two `cash` accounts in the same currency are indistinguishable
-- (both are just "the currency's physical cash"), but two `credit-card`
-- accounts in the same currency are two different cards and must stay legal.
--
-- The two live free-text account strings this pillar's imports have ever
-- produced ("Amex", "ANZ Credit Card") are backfilled here: one `institutions`
-- row per bank, one `accounts` row per string (both `kind = 'credit-card'`,
-- `currency = 'AUD'`, seeded by 0081), then `transactions.account_id` is
-- populated by matching `transactions.account` against `accounts.name`.
--
-- SQLite can't add a data-dependent NOT NULL column with a plain ALTER TABLE,
-- so `transactions` is rebuilt (same pattern as 0057/0064):
-- `CREATE TABLE __new_transactions`, `INSERT INTO __new_transactions SELECT
-- ... FROM transactions`, `DROP TABLE transactions`,
-- `ALTER TABLE __new_transactions RENAME TO transactions`, indexes recreated.
-- `account_id` is looked up via a correlated subquery against `accounts.name`
-- in that INSERT's SELECT list. Because the destination column is `NOT NULL`,
-- a `transactions.account` value that matches no seeded account name makes
-- the subquery return NULL and the whole INSERT — and therefore the whole
-- migration transaction — fails loudly with a NOT NULL constraint violation,
-- rather than silently landing a NULL `account_id` or inventing an "unknown
-- account" row to swallow the mismatch. `account` (the free-text column)
-- keeps being written and read unchanged; it is dropped in POPS-2770, not
-- this migration.
--
-- REQUIRED before running against any real database: take a full backup/
-- snapshot first, same as 0064 — this migration is destructive to roll back
-- gracefully once new `account_id`-only writes have landed.

CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution_id` text,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`archived_at` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`entity_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_name_nocase` ON `accounts` (`name` COLLATE NOCASE);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_kind_currency_cash` ON `accounts` (`kind`, `currency`) WHERE `kind` = 'cash';
--> statement-breakpoint
CREATE INDEX `idx_accounts_institution` ON `accounts` (`institution_id`);
--> statement-breakpoint
INSERT INTO `institutions` (`id`, `name`, `colour`) VALUES
	('00000000-0000-4000-8000-000000000001', 'Amex', '#006FCF'),
	('00000000-0000-4000-8000-000000000002', 'ANZ', '#005596');
--> statement-breakpoint
INSERT INTO `accounts` (`id`, `name`, `institution_id`, `kind`, `currency`) VALUES
	('00000000-0000-4000-8000-000000000003', 'Amex', '00000000-0000-4000-8000-000000000001', 'credit-card', 'AUD'),
	('00000000-0000-4000-8000-000000000004', 'ANZ Credit Card', '00000000-0000-4000-8000-000000000002', 'credit-card', 'AUD');
--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`description` text NOT NULL,
	`account` text NOT NULL,
	`account_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`country` text,
	`related_transaction_id` text,
	`notes` text,
	`foreign_amount_minor` integer,
	`foreign_currency` text,
	`fx_fee_cents` integer,
	`fx_capture_source` text,
	`checksum` text,
	`raw_row` text,
	`last_edited_time` text NOT NULL,
	`match_type` text,
	`match_rule_id` text,
	`match_confidence` real,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transactions` (
	`id`, `notion_id`, `description`, `account`, `account_id`, `amount_cents`, `date`, `type`,
	`tags`, `entity_id`, `entity_name`, `location`, `country`,
	`related_transaction_id`, `notes`, `foreign_amount_minor`, `foreign_currency`,
	`fx_fee_cents`, `fx_capture_source`, `checksum`, `raw_row`,
	`last_edited_time`, `match_type`, `match_rule_id`, `match_confidence`
)
SELECT
	`id`, `notion_id`, `description`, `account`,
	(SELECT `id` FROM `accounts` WHERE `accounts`.`name` = `transactions`.`account`),
	`amount_cents`, `date`, `type`, `tags`, `entity_id`, `entity_name`, `location`, `country`,
	`related_transaction_id`, `notes`, `foreign_amount_minor`, `foreign_currency`,
	`fx_fee_cents`, `fx_capture_source`, `checksum`, `raw_row`,
	`last_edited_time`, `match_type`, `match_rule_id`, `match_confidence`
FROM `transactions`;
--> statement-breakpoint
DROP TABLE `transactions`;
--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_notion_id_unique` ON `transactions` (`notion_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`date`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_account` ON `transactions` (`account`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_account_id` ON `transactions` (`account_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_entity` ON `transactions` (`entity_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_last_edited` ON `transactions` (`last_edited_time`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_notion_id` ON `transactions` (`notion_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_checksum` ON `transactions` (`checksum`);
