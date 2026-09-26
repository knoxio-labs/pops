CREATE TABLE `lookup_cache` (
	`code` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`product_json` text,
	`source` text,
	`fetched_at` text NOT NULL,
	`expires_at` text NOT NULL
);
