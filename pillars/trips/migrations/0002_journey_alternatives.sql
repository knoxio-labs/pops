CREATE TABLE `journey_group_members` (
	`group_id` integer NOT NULL,
	`journey_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`group_id`, `journey_id`),
	FOREIGN KEY (`group_id`) REFERENCES `journey_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_journey_group_members_journey` ON `journey_group_members` (`journey_id`);--> statement-breakpoint
CREATE TABLE `journey_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`current_journey_id` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_journey_groups_trip` ON `journey_groups` (`trip_id`);