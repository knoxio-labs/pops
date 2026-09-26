CREATE TABLE `device_sync_ledgers` (
	`device_id` text PRIMARY KEY NOT NULL,
	`device_label` text NOT NULL,
	`reported_at` text NOT NULL,
	`received_at` text NOT NULL,
	`report` text NOT NULL,
	CONSTRAINT `ck_device_sync_ledgers_report` CHECK(json_valid(`report`))
);
