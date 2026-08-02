CREATE TABLE `purchase_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`descriptor_pattern` text,
	`settlement_window_days` integer DEFAULT 21 NOT NULL,
	`auto_link_policy` text DEFAULT 'review' NOT NULL,
	`ingest_adapter` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "ck_purchase_sources_auto_link_policy" CHECK("purchase_sources"."auto_link_policy" IN ('auto','review')),
	CONSTRAINT "ck_purchase_sources_settlement_window_days" CHECK("purchase_sources"."settlement_window_days" > 0)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_order_id` text,
	`ingest_method` text NOT NULL,
	`ordered_at` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`merchant_entity_id` text,
	`merchant_entity_name` text,
	`settlement_mode` text DEFAULT 'unknown' NOT NULL,
	`payment_hint` text,
	`raw_ref` text,
	`checksum` text NOT NULL,
	`status` text DEFAULT 'awaiting_settlement' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source`) REFERENCES `purchase_sources`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_purchases_ingest_method" CHECK("purchases"."ingest_method" IN ('email','export','upload','manual')),
	CONSTRAINT "ck_purchases_settlement_mode" CHECK("purchases"."settlement_mode" IN ('card','cash','unknown')),
	CONSTRAINT "ck_purchases_status" CHECK("purchases"."status" IN ('awaiting_settlement','linked','partial','settled_cash','ignored')),
	CONSTRAINT "ck_purchases_currency" CHECK(length("purchases"."currency") = 3),
	CONSTRAINT "ck_purchases_components_non_negative" CHECK("purchases"."subtotal_cents" >= 0 AND "purchases"."shipping_cents" >= 0 AND "purchases"."tax_cents" >= 0 AND "purchases"."discount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_checksum_unique` ON `purchases` (`checksum`);--> statement-breakpoint
CREATE INDEX `idx_purchases_source_ordered_at` ON `purchases` (`source`,`ordered_at`);--> statement-breakpoint
CREATE INDEX `idx_purchases_status` ON `purchases` (`status`);--> statement-breakpoint
CREATE INDEX `idx_purchases_merchant_entity` ON `purchases` (`merchant_entity_id`);--> statement-breakpoint
CREATE INDEX `idx_purchases_source_order_id` ON `purchases` (`source`,`source_order_id`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`url` text,
	`image_url` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	`refunded_cents` integer DEFAULT 0 NOT NULL,
	`merchant_category` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`kind` text,
	`inventory_item_uri` text,
	`inventory_item_stale_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_purchase_items_kind" CHECK("purchase_items"."kind" IS NULL OR "purchase_items"."kind" IN ('consumable','durable','digital','service')),
	CONSTRAINT "ck_purchase_items_quantity" CHECK("purchase_items"."quantity" > 0),
	CONSTRAINT "ck_purchase_items_refunded_cents" CHECK("purchase_items"."refunded_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_items_purchase` ON `purchase_items` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_items_sku` ON `purchase_items` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_purchase_items_kind` ON `purchase_items` (`kind`);--> statement-breakpoint
CREATE TABLE `purchase_match_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`source` text,
	`is_active` integer DEFAULT true NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text,
	CONSTRAINT "ck_purchase_match_rules_match_type" CHECK("purchase_match_rules"."match_type" IN ('exact','contains','regex')),
	CONSTRAINT "ck_purchase_match_rules_is_active" CHECK("purchase_match_rules"."is_active" IN (0,1)),
	CONSTRAINT "ck_purchase_match_rules_confidence" CHECK("purchase_match_rules"."confidence" >= 0 AND "purchase_match_rules"."confidence" <= 1),
	CONSTRAINT "ck_purchase_match_rules_counters" CHECK("purchase_match_rules"."priority" >= 0 AND "purchase_match_rules"."times_applied" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_match_rules_pattern` ON `purchase_match_rules` (`description_pattern`);--> statement-breakpoint
CREATE INDEX `idx_purchase_match_rules_priority` ON `purchase_match_rules` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_purchase_match_rules_confidence` ON `purchase_match_rules` (`confidence`);--> statement-breakpoint
CREATE INDEX `idx_purchase_match_rules_times_applied` ON `purchase_match_rules` (`times_applied`);--> statement-breakpoint
CREATE TABLE `purchase_transaction_links` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`transaction_uri` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`link_type` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`match_rule_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`match_rule_id`) REFERENCES `purchase_match_rules`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_purchase_transaction_links_link_type" CHECK("purchase_transaction_links"."link_type" IN ('exact','split','combined','partial','refund','manual')),
	CONSTRAINT "ck_purchase_transaction_links_confidence" CHECK("purchase_transaction_links"."confidence" >= 0 AND "purchase_transaction_links"."confidence" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_purchase_transaction_links` ON `purchase_transaction_links` (`purchase_id`,`transaction_uri`);--> statement-breakpoint
CREATE INDEX `idx_purchase_links_purchase` ON `purchase_transaction_links` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_links_transaction` ON `purchase_transaction_links` (`transaction_uri`);--> statement-breakpoint
CREATE INDEX `idx_purchase_links_confirmed_at` ON `purchase_transaction_links` (`confirmed_at`);
