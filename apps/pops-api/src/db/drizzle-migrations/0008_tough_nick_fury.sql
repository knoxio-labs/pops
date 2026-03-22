CREATE TABLE `item_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`paperless_document_id` integer NOT NULL,
	`document_type` text NOT NULL,
	`title` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_item_documents_item` ON `item_documents` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_item_documents_doc` ON `item_documents` (`paperless_document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_documents_pair` ON `item_documents` (`item_id`,`paperless_document_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
