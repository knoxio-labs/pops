CREATE TABLE `glia_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`action_type` text NOT NULL,
	`affected_ids` text NOT NULL,
	`rationale` text NOT NULL,
	`payload` text,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`user_decision` text,
	`user_note` text,
	`executed_at` text,
	`decided_at` text,
	`reverted_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_glia_actions_action_type` ON `glia_actions` (`action_type`);--> statement-breakpoint
CREATE INDEX `idx_glia_actions_status` ON `glia_actions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_glia_actions_phase` ON `glia_actions` (`phase`);--> statement-breakpoint
CREATE INDEX `idx_glia_actions_created_at` ON `glia_actions` (`created_at`);--> statement-breakpoint
CREATE TABLE `glia_trust_state` (
	`action_type` text PRIMARY KEY NOT NULL,
	`current_phase` text NOT NULL,
	`approved_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`reverted_count` integer DEFAULT 0 NOT NULL,
	`autonomous_since` text,
	`last_revert_at` text,
	`graduated_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reflex_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`reflex_name` text NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_data` text,
	`action_type` text NOT NULL,
	`action_verb` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`triggered_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_reflex_exec_name` ON `reflex_executions` (`reflex_name`);--> statement-breakpoint
CREATE INDEX `idx_reflex_exec_trigger_type` ON `reflex_executions` (`trigger_type`);--> statement-breakpoint
CREATE INDEX `idx_reflex_exec_status` ON `reflex_executions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reflex_exec_triggered_at` ON `reflex_executions` (`triggered_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_debrief_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`dimension_id` integer NOT NULL,
	`comparison_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `debrief_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dimension_id`) REFERENCES `comparison_dimensions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_debrief_results`("id", "session_id", "dimension_id", "comparison_id", "created_at") SELECT "id", "session_id", "dimension_id", "comparison_id", "created_at" FROM `debrief_results`;--> statement-breakpoint
DROP TABLE `debrief_results`;--> statement-breakpoint
ALTER TABLE `__new_debrief_results` RENAME TO `debrief_results`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_debrief_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_history_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`watch_history_id`) REFERENCES `watch_history`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_debrief_sessions`("id", "watch_history_id", "status", "created_at") SELECT "id", "watch_history_id", "status", "created_at" FROM `debrief_sessions`;--> statement-breakpoint
DROP TABLE `debrief_sessions`;--> statement-breakpoint
ALTER TABLE `__new_debrief_sessions` RENAME TO `debrief_sessions`;