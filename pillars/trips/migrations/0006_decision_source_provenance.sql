ALTER TABLE `decision_options` ADD `validated_sources` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `decision_options` SET `validated_sources` = `affected_sources`;
