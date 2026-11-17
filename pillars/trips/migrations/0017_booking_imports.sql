CREATE TABLE `booking_import_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`binding_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`predecessor_id` text,
	`state` text NOT NULL,
	`proposals` text DEFAULT '[]' NOT NULL,
	`failure` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `booking_import_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`binding_id`) REFERENCES `booking_import_bindings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_booking_import_attempts_source` ON `booking_import_attempts` (`source_id`);--> statement-breakpoint
CREATE TABLE `booking_import_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`selection` text NOT NULL,
	`documents_origin` text,
	`media_type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `booking_import_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_booking_import_bindings_source` ON `booking_import_bindings` (`source_id`);--> statement-breakpoint
CREATE TABLE `booking_import_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`binding_id` text NOT NULL,
	`expected_source_revision` integer NOT NULL,
	`expected_capture_revision` integer NOT NULL,
	`admission` text NOT NULL,
	`attempt_id` text NOT NULL,
	`proposal_ids` text NOT NULL,
	`target` text NOT NULL,
	`committed_operation_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `booking_import_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`binding_id`) REFERENCES `booking_import_bindings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_booking_import_decisions_source` ON `booking_import_decisions` (`source_id`);--> statement-breakpoint
CREATE TABLE `booking_import_requests` (
	`trip_id` integer NOT NULL,
	`operation_id` text NOT NULL,
	`source_id` text NOT NULL,
	`canonical_request` text NOT NULL,
	`receipt` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `booking_import_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_booking_import_requests_operation` ON `booking_import_requests` (`trip_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `booking_import_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` integer NOT NULL,
	`representation` text NOT NULL,
	`sha256` text NOT NULL,
	`byte_length` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`latest_attempt_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_booking_import_sources_content` ON `booking_import_sources` (`trip_id`,`representation`,`sha256`,`byte_length`);