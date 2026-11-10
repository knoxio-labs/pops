CREATE TABLE `meeting_plan_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`operation_id` text NOT NULL,
	`request` text NOT NULL,
	`receipt` text NOT NULL,
	`expected_after` text NOT NULL,
	`undone_by` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_meeting_plan_operations_identity` ON `meeting_plan_operations` (`trip_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `meeting_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`removed` integer DEFAULT false NOT NULL,
	`contact_uri` text,
	`visit_id` integer,
	`title` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`intention` text DEFAULT 'Considering' NOT NULL,
	`agreement` text DEFAULT 'Not agreed' NOT NULL,
	`start_date` text,
	`end_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_meeting_plans_trip` ON `meeting_plans` (`trip_id`);