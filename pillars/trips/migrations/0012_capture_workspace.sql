CREATE TABLE `capture_associations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`removed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`capture_id` integer NOT NULL,
	`target` text NOT NULL,
	`provenance` text NOT NULL,
	`source_revision` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_capture_associations_trip` ON `capture_associations` (`trip_id`);--> statement-breakpoint
CREATE TABLE `captures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`place_id` integer,
	`visit_id` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`removed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`original_text` text NOT NULL,
	`original_url` text,
	`attachments` text DEFAULT '[]' NOT NULL,
	`title` text,
	`notes` text DEFAULT '' NOT NULL,
	`classification` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_captures_trip` ON `captures` (`trip_id`);--> statement-breakpoint
CREATE TABLE `explore_memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`removed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_explore_memberships_trip` ON `explore_memberships` (`trip_id`);--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`place_id` integer,
	`visit_id` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`removed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text,
	`kind` text,
	`purpose` text,
	`status` text,
	`reason` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`address` text,
	`timing` text DEFAULT '{"mode":"none"}' NOT NULL,
	`source_links` text DEFAULT '[]' NOT NULL,
	`contact_links` text DEFAULT '[]' NOT NULL,
	`recommendations` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ideas_trip` ON `ideas` (`trip_id`);--> statement-breakpoint
CREATE TABLE `source_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`operation_id` text NOT NULL,
	`request` text NOT NULL,
	`canonical_request` text NOT NULL,
	`receipt` text NOT NULL,
	`inverse` text NOT NULL,
	`undone_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_operations_trip_uuid` ON `source_operations` (`trip_id`,`operation_id`);