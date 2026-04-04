CREATE TABLE `comparison_skip_cooloffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dimension_id` integer NOT NULL,
	`media_a_type` text NOT NULL,
	`media_a_id` integer NOT NULL,
	`media_b_type` text NOT NULL,
	`media_b_id` integer NOT NULL,
	`skip_until` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dimension_id`) REFERENCES `comparison_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comparison_skip_cooloffs_pair` ON `comparison_skip_cooloffs` (`dimension_id`,`media_a_type`,`media_a_id`,`media_b_type`,`media_b_id`);