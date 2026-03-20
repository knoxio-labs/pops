CREATE TABLE `ai_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`entity_name` text,
	`category` text,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`cached` integer DEFAULT 0 NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_usage_created_at` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_batch` ON `ai_usage` (`import_batch_id`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`category` text NOT NULL,
	`period` text,
	`amount` real,
	`active` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_notion_id_unique` ON `budgets` (`notion_id`);--> statement-breakpoint
CREATE TABLE `transaction_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`transaction_type` text,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_corrections_pattern` ON `transaction_corrections` (`description_pattern`);--> statement-breakpoint
CREATE INDEX `idx_corrections_confidence` ON `transaction_corrections` (`confidence`);--> statement-breakpoint
CREATE INDEX `idx_corrections_times_applied` ON `transaction_corrections` (`times_applied`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`name` text NOT NULL,
	`type` text DEFAULT 'company' NOT NULL,
	`abn` text,
	`aliases` text,
	`default_transaction_type` text,
	`default_tags` text,
	`notes` text,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entities_notion_id_unique` ON `entities` (`notion_id`);--> statement-breakpoint
CREATE TABLE `environments` (
	`name` text PRIMARY KEY NOT NULL,
	`db_path` text NOT NULL,
	`seed_type` text DEFAULT 'none' NOT NULL,
	`ttl_seconds` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_environments_expires_at` ON `environments` (`expires_at`);--> statement-breakpoint
CREATE TABLE `home_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`item_name` text NOT NULL,
	`brand` text,
	`model` text,
	`item_id` text,
	`room` text,
	`location` text,
	`type` text,
	`condition` text,
	`in_use` integer,
	`deductible` integer,
	`purchase_date` text,
	`warranty_expires` text,
	`replacement_value` real,
	`resale_value` real,
	`purchase_transaction_id` text,
	`purchased_from_id` text,
	`purchased_from_name` text,
	`last_edited_time` text NOT NULL,
	FOREIGN KEY (`purchase_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`purchased_from_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `home_inventory_notion_id_unique` ON `home_inventory` (`notion_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
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
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_notion_id_unique` ON `transactions` (`notion_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_account` ON `transactions` (`account`);--> statement-breakpoint
CREATE INDEX `idx_transactions_entity` ON `transactions` (`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_last_edited` ON `transactions` (`last_edited_time`);--> statement-breakpoint
CREATE INDEX `idx_transactions_notion_id` ON `transactions` (`notion_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transactions_checksum` ON `transactions` (`checksum`);--> statement-breakpoint
CREATE TABLE `wish_list` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`item` text NOT NULL,
	`target_amount` real,
	`saved` real,
	`priority` text,
	`url` text,
	`notes` text,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wish_list_notion_id_unique` ON `wish_list` (`notion_id`);