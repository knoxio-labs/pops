CREATE TABLE `arrangement_responsibilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`responsibility` text,
	`revision` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_arrangement_responsibility_target` ON `arrangement_responsibilities` (`trip_id`,`target_kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `rentals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`provider` text,
	`pickup_visit_id` integer,
	`return_visit_id` integer,
	`start` text,
	`end` text,
	`status` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_rentals_trip` ON `rentals` (`trip_id`);