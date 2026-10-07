CREATE TABLE `pending_receipt_captures` (
	`receipt_key` text PRIMARY KEY NOT NULL,
	`client_captured_at` text,
	`client_time_zone` text,
	`client_latitude` real,
	`client_longitude` real,
	`captured_at` text,
	`captured_at_source` text,
	`utc_offset_minutes` integer,
	`declared_time_zone` text,
	`latitude` real,
	`longitude` real,
	`location_source` text,
	`expires_at` text NOT NULL,
	CONSTRAINT `ck_pending_receipt_capture_source` CHECK(`captured_at_source` IS NULL OR `captured_at_source` IN ('client','exif')),
	CONSTRAINT `ck_pending_receipt_capture_location_source` CHECK(`location_source` IS NULL OR `location_source` IN ('client','exif')),
	CONSTRAINT `ck_pending_receipt_capture_client_latitude` CHECK(`client_latitude` IS NULL OR (`client_latitude` >= -90 AND `client_latitude` <= 90)),
	CONSTRAINT `ck_pending_receipt_capture_client_longitude` CHECK(`client_longitude` IS NULL OR (`client_longitude` >= -180 AND `client_longitude` <= 180)),
	CONSTRAINT `ck_pending_receipt_capture_client_location_pair` CHECK((`client_latitude` IS NULL) = (`client_longitude` IS NULL)),
	CONSTRAINT `ck_pending_receipt_capture_latitude` CHECK(`latitude` IS NULL OR (`latitude` >= -90 AND `latitude` <= 90)),
	CONSTRAINT `ck_pending_receipt_capture_longitude` CHECK(`longitude` IS NULL OR (`longitude` >= -180 AND `longitude` <= 180)),
	CONSTRAINT `ck_pending_receipt_capture_location_pair` CHECK((`latitude` IS NULL) = (`longitude` IS NULL)),
	CONSTRAINT `ck_pending_receipt_capture_utc_offset` CHECK(`utc_offset_minutes` IS NULL OR (`utc_offset_minutes` >= -840 AND `utc_offset_minutes` <= 840))
);
--> statement-breakpoint
CREATE INDEX `idx_pending_receipt_captures_expires_at` ON `pending_receipt_captures` (`expires_at`);
