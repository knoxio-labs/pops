-- Add `item_uploaded_files` table for direct (non-Paperless) file uploads
-- attached to inventory items. Lives alongside the existing `item_documents`
-- table, which is reserved for Paperless-ngx links and keeps a mandatory
-- `paperless_document_id` column. Direct uploads need their own filesystem
-- columns (file_name / file_path / mime_type / file_size), so a parallel
-- table avoids retrofitting nullable columns onto the Paperless schema.

CREATE TABLE `item_uploaded_files` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `item_id` text NOT NULL,
  `file_name` text NOT NULL,
  `file_path` text NOT NULL,
  `mime_type` text NOT NULL,
  `file_size` integer NOT NULL,
  `uploaded_at` text DEFAULT (datetime('now')) NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`item_id`) REFERENCES `home_inventory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_item_uploaded_files_item` ON `item_uploaded_files` (`item_id`);
