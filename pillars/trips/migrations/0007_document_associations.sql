CREATE TABLE `trip_document_associations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`document_id` integer NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trip_document_associations_trip` ON `trip_document_associations` (`trip_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_trip_document_association` ON `trip_document_associations` (`trip_id`,`document_id`,`target_kind`,`target_id`);