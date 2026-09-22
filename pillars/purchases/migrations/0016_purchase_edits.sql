CREATE TABLE `purchase_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`field` text NOT NULL,
	`item_id` text,
	`original` text,
	`edited_at` text NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_purchase_edits_key` ON `purchase_edits` (`purchase_id`,`field`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_edits_purchase` ON `purchase_edits` (`purchase_id`);
