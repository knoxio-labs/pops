CREATE TABLE `shared_tag_ids` (
	`id` text PRIMARY KEY NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `trips` ADD `destination` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `when_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `tag_id` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `parent_id` integer REFERENCES trips(id);