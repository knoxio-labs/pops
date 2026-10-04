CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`facet` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`description` text,
	`window_start` text,
	`window_end` text,
	`window_region` text,
	`archived_at` text,
	`merged_into_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `ck_tags_window_bounds` CHECK(`window_end` IS NULL OR `window_start` IS NULL OR `window_end` >= `window_start`),
	CONSTRAINT `ck_tags_window_region_requires_start` CHECK(`window_region` IS NULL OR `window_start` IS NOT NULL),
	CONSTRAINT `ck_tags_merged_requires_archived` CHECK(`merged_into_id` IS NULL OR `archived_at` IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tags_active_facet_name` ON `tags` (`facet`, lower(`name`)) WHERE `archived_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_tags_parent_id` ON `tags` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `idx_tags_merged_into_id` ON `tags` (`merged_into_id`);
