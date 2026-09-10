-- POPS-3328 (finance ADR-005): a pending import is a server record. Replaces
-- the browser's IndexedDB copy of the wizard's state; also where rows from a
-- live provider wait for review before anything reaches the ledger.

CREATE TABLE `import_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`provider` text,
	`dialect_id` text,
	`source_file_names` text,
	`state` text NOT NULL,
	`step` integer,
	`shape_version` integer NOT NULL,
	`payload` text NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`unresolved_count` integer DEFAULT 0 NOT NULL,
	`date_from` text,
	`date_to` text,
	`balance_reported_cents` integer,
	`process_session_id` text,
	`owner_token` text,
	`owner_seen_at` text,
	`saved_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_import_drafts_account_state` ON `import_drafts` (`account_id`,`state`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_import_drafts_one_live_per_account` ON `import_drafts` (`account_id`) WHERE "import_drafts"."state" = 'live';
