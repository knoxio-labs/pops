CREATE TABLE `design_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`route` text NOT NULL,
	`theme_key` text DEFAULT '' NOT NULL,
	`viewport` text DEFAULT '' NOT NULL,
	`anchor_kind` text NOT NULL,
	`anchor` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_by` text,
	`resolved_at` text,
	CONSTRAINT "ck_design_threads_status" CHECK("design_threads"."status" IN ('open', 'applied', 'rejected', 'outdated'))
);
--> statement-breakpoint
CREATE INDEX `idx_design_threads_status` ON `design_threads` (`status`);--> statement-breakpoint
CREATE INDEX `idx_design_threads_created_at` ON `design_threads` (`created_at`);--> statement-breakpoint
CREATE TABLE `design_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `design_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_design_messages_thread` ON `design_messages` (`thread_id`,`created_at`);
