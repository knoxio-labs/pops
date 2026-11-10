CREATE TABLE `journey_leg_removals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`journey_id` integer NOT NULL,
	`leg_id` integer NOT NULL,
	`operation_id` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`removed_revision` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`remaining_leg_ids` text NOT NULL,
	`removed_at` text NOT NULL,
	`restored_expected_revision` integer,
	`restored_revision` integer,
	`restored_at` text,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leg_id`) REFERENCES `journey_legs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leg_removal_operation` ON `journey_leg_removals` (`journey_id`,`operation_id`);--> statement-breakpoint
ALTER TABLE `journey_legs` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `journey_legs` ADD `removal_operation_id` text;--> statement-breakpoint
ALTER TABLE `journeys` ADD `leg_revision` integer DEFAULT 0 NOT NULL;