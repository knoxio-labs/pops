CREATE TABLE `journey_legs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`journey_id` integer NOT NULL,
	`position` integer NOT NULL,
	`mode` text,
	`from_endpoint` text DEFAULT '{}' NOT NULL,
	`to_endpoint` text DEFAULT '{}' NOT NULL,
	`intention` text,
	`arrangement` text,
	`purchase` text,
	`operator` text,
	`service` text,
	`reference` text,
	`notes` text DEFAULT '' NOT NULL,
	`source_links` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_journey_legs_position` ON `journey_legs` (`journey_id`,`position`);--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`name` text,
	`reference` text,
	`notes` text DEFAULT '' NOT NULL,
	`source_links` text DEFAULT '[]' NOT NULL,
	`buffers` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_journeys_trip` ON `journeys` (`trip_id`);