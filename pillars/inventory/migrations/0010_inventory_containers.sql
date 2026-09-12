-- POPS-3581: containers — a box is a thing an item goes into.
--
-- `state` walks open -> sealed -> moved -> unpacked (`ck_containers_state`
-- mirrors `CONTAINER_STATES` in `src/db/schema/containers.ts`).
-- `origin_location_id` is where the container was packed; `destination_location_id`
-- is where it is headed once the `move` action sets it. Both are nullable
-- location refs, `set null` on delete so removing a location never blocks
-- removing a box that referenced it.
--
-- `container_id` on `home_inventory` is `set null` on delete: deleting a
-- container empties it, it does not delete what was inside.
CREATE TABLE `containers` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`code` text,
	`state` text DEFAULT 'open' NOT NULL,
	`origin_location_id` text,
	`destination_location_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`origin_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`destination_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `ck_containers_state` CHECK("containers"."state" IN ('open','sealed','moved','unpacked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_containers_code` ON `containers` (`code`);--> statement-breakpoint
CREATE INDEX `idx_containers_origin` ON `containers` (`origin_location_id`);--> statement-breakpoint
CREATE INDEX `idx_containers_destination` ON `containers` (`destination_location_id`);--> statement-breakpoint
CREATE INDEX `idx_containers_state` ON `containers` (`state`);--> statement-breakpoint
ALTER TABLE `home_inventory` ADD `container_id` text REFERENCES containers(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `idx_inventory_container` ON `home_inventory` (`container_id`);
