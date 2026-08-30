CREATE TABLE IF NOT EXISTS `watch_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`progress` real NOT NULL,
	`view_offset_ms` integer NOT NULL,
	`duration_ms` integer,
	`observed_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_watch_progress_media` ON `watch_progress` (`media_type`,`media_id`);
