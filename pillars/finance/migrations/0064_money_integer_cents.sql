-- CF041 (#3665, finance-audit epic #3606): money was stored as `real` (IEEE-754
-- float) across `transactions.amount`, `budgets.amount`, and
-- `wish_list.target_amount`/`saved`. Float subtraction on these columns produces
-- values like `100.10 - 100.00 -> 0.09999999999999432`; any consumer that
-- doesn't round (an MCP tool, a CSV export, a future integration) gets that raw
-- float back. This migration converts every money column to integer cents —
-- `CAST(ROUND(amount * 100) AS INTEGER)` — and all four columns are renamed to
-- an explicit `*_cents` suffix so a future reader can't mistake a cents value
-- for a dollar one (or vice versa).
--
-- SQLite can't ALTER COLUMN a type, so each table is rebuilt (same pattern as
-- 0061). `ROUND()` before the cast guards the float-imprecision case
-- (`19.99 * 100` is `1998.9999999999998` before rounding, `0.1 * 100` is
-- `10.000000000000002`); NULL propagates through arithmetic untouched, so
-- nullable `budgets.amount`/`wish_list.target_amount`/`wish_list.saved` stay
-- NULL rather than becoming 0.
--
-- REQUIRED before running against any real database: take a full backup/
-- snapshot first. This migration is destructive to roll back gracefully (see
-- below), and running it twice would double-scale every value it it were not
-- for the migrator's own bookkeeping.
--
-- Idempotency: this file executes at most once against a given database
-- because `drizzle-orm`'s migrator (`open-finance-db.ts`) records every
-- applied migration's hash in `__drizzle_migrations` and skips a tag it has
-- already run (see that file's docstring) — the same guarantee every other
-- hand-written migration in this package (0059, 0061, ...) already relies on.
-- Belt-and-suspenders: because the source columns are renamed as part of the
-- rebuild (`amount` -> `amount_cents`, etc.), manually re-running this file's
-- SQL body a second time against an already-migrated database fails loudly
-- with "no such column: amount" instead of silently re-scaling an
-- already-converted value to 100x — there is no code path that reads
-- `amount_cents` and multiplies it by 100 again.
--
-- Rollback path: this migration is additive-only at the schema-journal level
-- (nothing later depends on the old column names), so rolling back means
-- restoring the pre-migration backup/snapshot taken above — there is no
-- forward-compatible "down" migration for a lossy rename+retype like this one
-- once new cents-denominated rows have been written. Do not attempt to write
-- a compensating `amount_cents / 100 -> amount` migration against a live
-- database that has taken writes since this ran; restore from snapshot
-- instead.

CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`description` text NOT NULL,
	`account` text NOT NULL,
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
	`checksum` text,
	`raw_row` text,
	`last_edited_time` text NOT NULL,
	`match_type` text,
	`match_rule_id` text,
	`match_confidence` real
);
--> statement-breakpoint
INSERT INTO `__new_transactions` (
	`id`, `notion_id`, `description`, `account`, `amount_cents`, `date`, `type`,
	`tags`, `entity_id`, `entity_name`, `location`, `country`,
	`related_transaction_id`, `notes`, `checksum`, `raw_row`,
	`last_edited_time`, `match_type`, `match_rule_id`, `match_confidence`
)
SELECT
	`id`, `notion_id`, `description`, `account`,
	CAST(ROUND(`amount` * 100) AS INTEGER),
	`date`, `type`, `tags`, `entity_id`, `entity_name`, `location`, `country`,
	`related_transaction_id`, `notes`, `checksum`, `raw_row`,
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
CREATE INDEX `idx_transactions_entity` ON `transactions` (`entity_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_last_edited` ON `transactions` (`last_edited_time`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_notion_id` ON `transactions` (`notion_id`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_checksum` ON `transactions` (`checksum`);
--> statement-breakpoint
CREATE TABLE `__new_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`category` text NOT NULL,
	`period` text,
	`amount_cents` integer,
	`active` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`last_edited_time` text NOT NULL,
	`owner_uri` text,
	`owner_uri_stale_at` text
);
--> statement-breakpoint
INSERT INTO `__new_budgets` (
	`id`, `notion_id`, `category`, `period`, `amount_cents`, `active`, `notes`,
	`last_edited_time`, `owner_uri`, `owner_uri_stale_at`
)
SELECT
	`id`, `notion_id`, `category`, `period`,
	CAST(ROUND(`amount` * 100) AS INTEGER),
	`active`, `notes`, `last_edited_time`, `owner_uri`, `owner_uri_stale_at`
FROM `budgets`;
--> statement-breakpoint
DROP TABLE `budgets`;
--> statement-breakpoint
ALTER TABLE `__new_budgets` RENAME TO `budgets`;
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_notion_id_unique` ON `budgets` (`notion_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budgets_category_period` ON `budgets` (`category`, COALESCE(`period`, char(0)));
--> statement-breakpoint
CREATE INDEX `idx_budgets_owner_uri` ON `budgets` (`owner_uri`);
--> statement-breakpoint
CREATE TABLE `__new_wish_list` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`item` text NOT NULL,
	`target_amount_cents` integer,
	`saved_cents` integer,
	`priority` text,
	`url` text,
	`notes` text,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_wish_list` (
	`id`, `notion_id`, `item`, `target_amount_cents`, `saved_cents`, `priority`,
	`url`, `notes`, `last_edited_time`
)
SELECT
	`id`, `notion_id`, `item`,
	CAST(ROUND(`target_amount` * 100) AS INTEGER),
	CAST(ROUND(`saved` * 100) AS INTEGER),
	`priority`, `url`, `notes`, `last_edited_time`
FROM `wish_list`;
--> statement-breakpoint
DROP TABLE `wish_list`;
--> statement-breakpoint
ALTER TABLE `__new_wish_list` RENAME TO `wish_list`;
--> statement-breakpoint
CREATE UNIQUE INDEX `wish_list_notion_id_unique` ON `wish_list` (`notion_id`);
