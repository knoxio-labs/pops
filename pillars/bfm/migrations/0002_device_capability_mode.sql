ALTER TABLE `devices` ADD `capability_mode` text DEFAULT 'explicit' NOT NULL;--> statement-breakpoint
UPDATE `devices` SET `capability_mode` = 'tracks-default';
