CREATE TABLE `item_computed_dependencies` (
	`dependency_item_id` text NOT NULL,
	`dependent_item_id` text NOT NULL,
	PRIMARY KEY(`dependency_item_id`, `dependent_item_id`),
	FOREIGN KEY (`dependent_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ck_item_computed_dependencies_not_self` CHECK(`dependency_item_id` <> `dependent_item_id`)
) WITHOUT ROWID;--> statement-breakpoint
CREATE INDEX `item_computed_dependencies_dependent` ON `item_computed_dependencies` (`dependent_item_id`);--> statement-breakpoint
CREATE TABLE `computed_dependency_index_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`catalogue_revision` integer NOT NULL,
	CONSTRAINT `ck_computed_dependency_index_state_singleton` CHECK(`id` = 1)
);
