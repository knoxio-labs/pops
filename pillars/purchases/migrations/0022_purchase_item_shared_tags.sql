CREATE TABLE `purchase_item_shared_tags` (
	`item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`confirmed_at` text,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `purchase_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_item_shared_tags_tag` ON `purchase_item_shared_tags` (`tag_id`);
--> statement-breakpoint
CREATE TABLE `shared_tag_cache` (
	`tag_id` text PRIMARY KEY NOT NULL,
	`facet` text NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`merged_into_id` text,
	`fetched_at` text NOT NULL
);
