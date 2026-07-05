-- CF021 (#3627): the schema default for `transaction_corrections.confidence`
-- (0.5) sat below the matching floor (`MIN_MATCH_CONFIDENCE` = 0.7) every
-- matcher enforces, so a rule created without an explicit confidence (e.g. via
-- `POST /corrections`, which never accepts a caller-supplied confidence) was
-- born structurally inert — active, visible, and never able to fire a single
-- match. SQLite can't ALTER COLUMN DEFAULT, so the table is rebuilt.
--
-- Existing rows already persisted at confidence < 0.7 are left untouched —
-- this migration only fixes the default new rows get; live inert rules are a
-- data cleanup, not a schema concern.

CREATE TABLE `__new_transaction_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`transaction_type` text,
	`is_active` integer DEFAULT true NOT NULL,
	`confidence` real DEFAULT 0.7 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
INSERT INTO `__new_transaction_corrections` SELECT `id`, `description_pattern`, `match_type`, `entity_id`, `entity_name`, `location`, `tags`, `transaction_type`, `is_active`, `confidence`, `priority`, `times_applied`, `created_at`, `last_used_at` FROM `transaction_corrections`;
--> statement-breakpoint
DROP TABLE `transaction_corrections`;
--> statement-breakpoint
ALTER TABLE `__new_transaction_corrections` RENAME TO `transaction_corrections`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_pattern` ON `transaction_corrections` (`description_pattern`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_confidence` ON `transaction_corrections` (`confidence`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_times_applied` ON `transaction_corrections` (`times_applied`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_priority` ON `transaction_corrections` (`priority`);
