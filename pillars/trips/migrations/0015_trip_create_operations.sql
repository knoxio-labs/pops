CREATE TABLE `trip_create_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`operation_id` text NOT NULL,
	`request` text NOT NULL,
	`canonical_request` text NOT NULL,
	`receipt` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trip_create_operations_uuid` ON `trip_create_operations` (`operation_id`);