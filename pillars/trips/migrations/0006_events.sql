CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`visit_id` integer,
	`name` text,
	`intention` text,
	`arrangement` text,
	`purchase` text,
	`timing` text DEFAULT '{}' NOT NULL,
	`address` text,
	`reference` text,
	`source_url` text,
	`ticket_url` text,
	`notes` text DEFAULT '' NOT NULL,
	`source_links` text DEFAULT '[]' NOT NULL,
	`venue_links` text DEFAULT '[]' NOT NULL,
	`organiser_links` text DEFAULT '[]' NOT NULL,
	`document_links` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_trip` ON `events` (`trip_id`);