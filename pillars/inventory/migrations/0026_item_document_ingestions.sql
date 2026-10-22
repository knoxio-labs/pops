CREATE TABLE `item_document_ingestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`task_id` text NOT NULL,
	`document_type` text NOT NULL,
	`title` text,
	`file_name` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ck_item_document_ingestions_state` CHECK("item_document_ingestions"."state" IN ('pending', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_document_ingestions_task` ON `item_document_ingestions` (`task_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_document_ingestions_item` ON `item_document_ingestions` (`item_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_document_ingestions_state` ON `item_document_ingestions` (`state`);
