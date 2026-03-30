CREATE TABLE `sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`synced_at` text NOT NULL,
	`movies_synced` integer DEFAULT 0 NOT NULL,
	`tv_shows_synced` integer DEFAULT 0 NOT NULL,
	`errors` text,
	`duration_ms` integer
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_home_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`item_name` text NOT NULL,
	`brand` text,
	`model` text,
	`item_id` text,
	`room` text,
	`location` text,
	`type` text,
	`condition` text DEFAULT 'good',
	`in_use` integer,
	`deductible` integer,
	`purchase_date` text,
	`warranty_expires` text,
	`replacement_value` real,
	`resale_value` real,
	`purchase_transaction_id` text,
	`purchased_from_id` text,
	`purchased_from_name` text,
	`purchase_price` real,
	`asset_id` text,
	`notes` text,
	`location_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_edited_time` text NOT NULL,
	FOREIGN KEY (`purchase_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`purchased_from_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_home_inventory`("id", "notion_id", "item_name", "brand", "model", "item_id", "room", "location", "type", "condition", "in_use", "deductible", "purchase_date", "warranty_expires", "replacement_value", "resale_value", "purchase_transaction_id", "purchased_from_id", "purchased_from_name", "purchase_price", "asset_id", "notes", "location_id", "created_at", "updated_at", "last_edited_time") SELECT "id", "notion_id", "item_name", "brand", "model", "item_id", "room", "location", "type", "condition", "in_use", "deductible", "purchase_date", "warranty_expires", "replacement_value", "resale_value", "purchase_transaction_id", "purchased_from_id", "purchased_from_name", "purchase_price", "asset_id", "notes", "location_id", "created_at", "updated_at", "last_edited_time" FROM `home_inventory`;--> statement-breakpoint
DROP TABLE `home_inventory`;--> statement-breakpoint
ALTER TABLE `__new_home_inventory` RENAME TO `home_inventory`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `home_inventory_notion_id_unique` ON `home_inventory` (`notion_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `home_inventory_asset_id_unique` ON `home_inventory` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_asset_id` ON `home_inventory` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_name` ON `home_inventory` (`item_name`);--> statement-breakpoint
CREATE INDEX `idx_inventory_location` ON `home_inventory` (`location_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_type` ON `home_inventory` (`type`);--> statement-breakpoint
CREATE INDEX `idx_inventory_warranty` ON `home_inventory` (`warranty_expires`);--> statement-breakpoint
ALTER TABLE `comparison_dimensions` ADD `weight` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `watchlist` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `watchlist` ADD `plex_rating_key` text;--> statement-breakpoint
CREATE INDEX `idx_locations_parent_sort` ON `locations` (`parent_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watch_history_unique` ON `watch_history` (`media_type`,`media_id`,`watched_at`);--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`description` text NOT NULL,
	`account` text NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`country` text,
	`related_transaction_id` text,
	`notes` text,
	`checksum` text,
	`raw_row` text,
	`last_edited_time` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "notion_id", "description", "account", "amount", "date", "type", "tags", "entity_id", "entity_name", "location", "country", "related_transaction_id", "notes", "checksum", "raw_row", "last_edited_time") SELECT "id", "notion_id", "description", "account", "amount", "date", "type", "tags", "entity_id", "entity_name", "location", "country", "related_transaction_id", "notes", "checksum", "raw_row", "last_edited_time" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_notion_id_unique` ON `transactions` (`notion_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_account` ON `transactions` (`account`);--> statement-breakpoint
CREATE INDEX `idx_transactions_entity` ON `transactions` (`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_last_edited` ON `transactions` (`last_edited_time`);--> statement-breakpoint
CREATE INDEX `idx_transactions_notion_id` ON `transactions` (`notion_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transactions_checksum` ON `transactions` (`checksum`);