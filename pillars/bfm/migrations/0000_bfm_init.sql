CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`public_key_der` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_devices_revoked_at` ON `devices` (`revoked_at`);--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "ck_pairing_codes_expiry_after_creation" CHECK("pairing_codes"."expires_at" > "pairing_codes"."created_at")
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`family_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`revoked_at` text,
	`replaced_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`replaced_by`) REFERENCES `refresh_tokens`(`token_hash`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_refresh_tokens_expiry_after_creation" CHECK("refresh_tokens"."expires_at" > "refresh_tokens"."created_at"),
	CONSTRAINT "ck_refresh_tokens_no_self_succession" CHECK("refresh_tokens"."replaced_by" IS NOT "refresh_tokens"."token_hash")
);
--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_device` ON `refresh_tokens` (`device_id`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_family` ON `refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_refresh_tokens_replaced_by` ON `refresh_tokens` (`replaced_by`);
