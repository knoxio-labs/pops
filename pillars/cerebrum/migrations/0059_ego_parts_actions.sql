ALTER TABLE `messages` ADD `parts` text;
--> statement-breakpoint
CREATE TABLE `ego_action_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`loop_state` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ego_action_batches_conversation` ON `ego_action_batches` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX `idx_ego_action_batches_message` ON `ego_action_batches` (`message_id`);
--> statement-breakpoint
CREATE TABLE `ego_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	`position` integer NOT NULL,
	`tool` text NOT NULL,
	`args` text NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`batch_id`) REFERENCES `ego_action_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ego_actions_conversation` ON `ego_actions` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX `idx_ego_actions_message` ON `ego_actions` (`message_id`);
--> statement-breakpoint
CREATE INDEX `idx_ego_actions_batch` ON `ego_actions` (`batch_id`);
