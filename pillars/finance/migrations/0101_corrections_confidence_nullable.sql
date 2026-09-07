-- ADR-053/POPS-3130. `transaction_corrections.confidence` stops being a
-- decision input anywhere (POPS-3127..3129 already removed every read of it
-- for matching or review routing) and becomes an audit-only field: `null`
-- means no probability was ever assessed. Every row in this table today was
-- born at the 0061 default (0.7) or a `+0.1` reinforcement bump off it —
-- `transaction_corrections.confidence` has never once carried a genuine AI
-- assessment (the AI categorizer's confidence lives on the transaction
-- match, not on a persisted correction row; the wizard's `patternConfidence`
-- is a display-only warning, never written into an `add` op). So nulling
-- every existing row loses nothing real and stops the rule card from
-- rendering "confidence: 70%" beside a rule that was always unconditional.
--
-- SQLite can't ALTER COLUMN DROP NOT NULL / DROP DEFAULT, so the table is
-- rebuilt (same shape 0061/0091 used for their own rebuilds).

CREATE TABLE `__new_transaction_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text NOT NULL,
	`account_id` text,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`transaction_type` text,
	`is_active` integer DEFAULT true NOT NULL,
	`confidence` real,
	`priority` integer DEFAULT 0 NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transaction_corrections` (
	`id`, `description_pattern`, `account_id`, `match_type`, `entity_id`, `entity_name`,
	`location`, `tags`, `transaction_type`, `is_active`, `confidence`, `priority`,
	`times_applied`, `created_at`, `last_used_at`
)
SELECT
	`id`, `description_pattern`, `account_id`, `match_type`, `entity_id`, `entity_name`,
	`location`, `tags`, `transaction_type`, `is_active`, NULL, `priority`,
	`times_applied`, `created_at`, `last_used_at`
FROM `transaction_corrections`;
--> statement-breakpoint
DROP TABLE `transaction_corrections`;
--> statement-breakpoint
ALTER TABLE `__new_transaction_corrections` RENAME TO `transaction_corrections`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_pattern` ON `transaction_corrections` (`description_pattern`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_account` ON `transaction_corrections` (`account_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_confidence` ON `transaction_corrections` (`confidence`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_times_applied` ON `transaction_corrections` (`times_applied`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_priority` ON `transaction_corrections` (`priority`);
