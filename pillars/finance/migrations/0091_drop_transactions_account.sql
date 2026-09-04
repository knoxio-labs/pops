-- Drops the free-text `transactions.account` column and its
-- `idx_transactions_account` index.
--
-- `0083_accounts` introduced `transactions.account_id` (a real FK onto
-- `accounts.id`) alongside the pre-existing free-text `account` label, and
-- kept `account` around only until backend reads moved over to `account_id`.
-- Every read/write path in this pillar now goes through `account_id` — the
-- free-text column has had no remaining reader since, and this migration
-- removes it.
--
-- SQLite has no native `ALTER TABLE ... DROP COLUMN` that also drops a
-- dependent index in one step and this connection runs with `foreign_keys`
-- enforcement on, so `transactions` is rebuilt the same way 0064/0083 did:
-- `CREATE TABLE __new_transactions` (identical shape, minus `account`),
-- copy every row, `DROP TABLE transactions`, rename the new table into place,
-- recreate every index except `idx_transactions_account`. The `account_id`
-- foreign key is carried over unchanged, and no other table has a foreign
-- key onto `transactions`, so the rebuild needs no cross-table bookkeeping.
--
-- REQUIRED before running against any real database: take a full backup/
-- snapshot first, same as 0064/0083 — this migration is destructive to roll
-- back gracefully (the free-text label is not reconstructible from
-- `account_id` alone once an account has been renamed or merged).

CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`description` text NOT NULL,
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
	`id`, `notion_id`, `description`, `account_id`, `amount_cents`, `date`, `type`,
	`tags`, `entity_id`, `entity_name`, `location`, `country`,
	`related_transaction_id`, `notes`, `foreign_amount_minor`, `foreign_currency`,
	`fx_fee_cents`, `fx_capture_source`, `checksum`, `raw_row`,
	`last_edited_time`, `match_type`, `match_rule_id`, `match_confidence`
)
SELECT
	`id`, `notion_id`, `description`, `account_id`,
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
CREATE INDEX `idx_transactions_account_id` ON `transactions` (`account_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_entity` ON `transactions` (`entity_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_last_edited` ON `transactions` (`last_edited_time`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_notion_id` ON `transactions` (`notion_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_checksum` ON `transactions` (`checksum`);
