CREATE TABLE `purchase_tags` (
	`purchase_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`purchase_id`, `tag`),
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_tags_tag` ON `purchase_tags` (`tag`);
