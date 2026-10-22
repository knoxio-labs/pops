CREATE TABLE `item_parts` (
	`part_item_id` text PRIMARY KEY NOT NULL,
	`assembly_item_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`part_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assembly_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ck_item_parts_not_self` CHECK("item_parts"."part_item_id" <> "item_parts"."assembly_item_id")
);
--> statement-breakpoint
CREATE INDEX `idx_item_parts_assembly` ON `item_parts` (`assembly_item_id`);
