ALTER TABLE `events` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `events` ADD `removal_operation_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `removal_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `journeys` ADD `removal_operation_id` text;--> statement-breakpoint
ALTER TABLE `journeys` ADD `removal_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meeting_plans` ADD `removal_operation_id` text;--> statement-breakpoint
ALTER TABLE `rentals` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `rentals` ADD `removal_operation_id` text;--> statement-breakpoint
ALTER TABLE `rentals` ADD `removal_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_operations` ADD `family` text DEFAULT 'placement' NOT NULL;--> statement-breakpoint
ALTER TABLE `route_operations` ADD `source_inverse` text;--> statement-breakpoint
ALTER TABLE `stays` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `stays` ADD `removal_operation_id` text;--> statement-breakpoint
ALTER TABLE `stays` ADD `removal_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `visits` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `visits` ADD `removal_operation_id` text;--> statement-breakpoint
ALTER TABLE `visits` ADD `removal_revision` integer DEFAULT 0 NOT NULL;