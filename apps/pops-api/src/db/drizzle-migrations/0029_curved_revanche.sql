CREATE TABLE `rotation_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`rating` real,
	`poster_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`discovered_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `rotation_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rotation_candidates_tmdb_id` ON `rotation_candidates` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `idx_rotation_candidates_source_id` ON `rotation_candidates` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_rotation_candidates_status` ON `rotation_candidates` (`status`);--> statement-breakpoint
CREATE TABLE `rotation_exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`reason` text,
	`excluded_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rotation_exclusions_tmdb_id` ON `rotation_exclusions` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `rotation_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`priority` integer DEFAULT 5 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`config` text,
	`last_synced_at` text,
	`sync_interval_hours` integer DEFAULT 24 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rotation_sources_type` ON `rotation_sources` (`type`);