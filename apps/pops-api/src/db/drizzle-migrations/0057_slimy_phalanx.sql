CREATE TABLE `fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`location_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_edited_time` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_fixtures_location` ON `fixtures` (`location_id`);--> statement-breakpoint
CREATE INDEX `idx_fixtures_type` ON `fixtures` (`type`);--> statement-breakpoint
CREATE INDEX `idx_fixtures_name` ON `fixtures` (`name`);--> statement-breakpoint
CREATE TABLE `item_fixture_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_item_fixture_conn_item` ON `item_fixture_connections` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_item_fixture_conn_fixture` ON `item_fixture_connections` (`fixture_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_fixture_connections_pair` ON `item_fixture_connections` (`item_id`,`fixture_id`);