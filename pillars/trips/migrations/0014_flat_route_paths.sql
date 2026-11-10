CREATE TABLE `route_gaps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `route_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`operation_id` text NOT NULL,
	`request` text NOT NULL,
	`receipt` text NOT NULL,
	`expected_after` text NOT NULL,
	`undone_by` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_route_operations_identity` ON `route_operations` (`trip_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `route_paths` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trip_routes` (
	`trip_id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `trip_routes` (`trip_id`, `revision`, `content`)
SELECT `trips`.`id`, 0,
  json_object('order', json((
    SELECT json_group_array(json_object('kind', 'visit', 'id', `ordered_visits`.`id`))
    FROM (SELECT `id` FROM `visits` WHERE `trip_id` = `trips`.`id` ORDER BY `position`, `id`) AS `ordered_visits`
  )), 'paths', json('[]'))
FROM `trips`;
