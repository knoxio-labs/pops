CREATE TABLE `receipt_external_references` (
	`id` text PRIMARY KEY NOT NULL,
	`document_uri` text NOT NULL,
	`owner_uri` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_receipt_external_references` ON `receipt_external_references` (`document_uri`,`owner_uri`);
--> statement-breakpoint
CREATE INDEX `idx_receipt_external_references_owner` ON `receipt_external_references` (`owner_uri`);
