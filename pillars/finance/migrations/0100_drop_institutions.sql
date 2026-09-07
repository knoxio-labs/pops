-- POPS-3064, the last step of the institution→entity consolidation epic
-- (POPS-3060). POPS-3099 confirmed every `accounts` row now carries a
-- populated `entity_id` (direct, or backfilled from a migrated institution
-- by 0099) — the `institution_id` fallback this pillar's read path relied on
-- has nothing left to resolve, so this migration removes it along with the
-- `institutions` table it pointed at and the `logo_blobs` table that existed
-- only to store an institution's uploaded logo.
--
-- `accounts` is rebuilt without `institution_id` (same pattern as 0091):
-- SQLite has no single-step `ALTER TABLE ... DROP COLUMN` that also drops a
-- dependent index and FK, so `__new_accounts` is created without the column,
-- every row is copied, `accounts` is dropped, the new table is renamed into
-- place, and every remaining index is recreated — `idx_accounts_institution`
-- is not, since the column it indexed no longer exists. The rebuild runs
-- BEFORE `institutions` is dropped, so nothing ever references a table that
-- no longer exists.
--
-- REQUIRED before running against any real database: take a full backup/
-- snapshot first, same as every other destructive migration in this
-- package — this drops two whole tables and a column, none of it
-- reconstructible afterwards.

CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`archived_at` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`entity_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_accounts` (
	`id`, `name`, `kind`, `currency`, `archived_at`, `display_order`, `entity_id`,
	`created_at`, `updated_at`
)
SELECT
	`id`, `name`, `kind`, `currency`, `archived_at`, `display_order`, `entity_id`,
	`created_at`, `updated_at`
FROM `accounts`;
--> statement-breakpoint
DROP TABLE `accounts`;
--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_name_nocase` ON `accounts` (`name` COLLATE NOCASE);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_entity_currency` ON `accounts` (`entity_id`, `currency`) WHERE `kind` = 'person';
--> statement-breakpoint
DROP TABLE `institutions`;
--> statement-breakpoint
DROP TABLE `logo_blobs`;
