ALTER TABLE `tag_vocabulary` ADD COLUMN `shared_tag_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tag_vocabulary_shared_tag_id`
  ON `tag_vocabulary` (`shared_tag_id`)
  WHERE `shared_tag_id` IS NOT NULL;
