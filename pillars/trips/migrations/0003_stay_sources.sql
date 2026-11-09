CREATE TABLE `stays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`visit_id` integer,
	`name` text,
	`kind` text,
	`status` text,
	`timing` text DEFAULT '{}' NOT NULL,
	`address` text,
	`reference` text,
	`notes` text DEFAULT '' NOT NULL,
	`source_links` text DEFAULT '[]' NOT NULL,
	`host_links` text DEFAULT '[]' NOT NULL,
	`document_links` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_stays_trip` ON `stays` (`trip_id`);