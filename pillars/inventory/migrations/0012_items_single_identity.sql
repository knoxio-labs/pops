-- POPS-4047 (Inventory ADR-002, "Migration"): one item identity.
--
-- `home_inventory` and `containers` fold into `items`; a container is an item
-- with `is_container = 1`. Drizzle applies every pending migration inside ONE
-- transaction with foreign keys ON, so the usual rebuild recipe
-- (`PRAGMA foreign_keys = OFF`) is unavailable: the pragma is a no-op inside a
-- transaction. And with foreign keys on, `DROP TABLE home_inventory` runs an
-- implicit `DELETE` that would cascade into every leaf table still pointing at
-- it. So the order below never drops a table that still has children: the
-- leaf tables are rebuilt against `items` first, and only then are the two old
-- tables dropped.
--
-- Preflight: a collision the migration may not resolve on its own (an id held
-- by both old tables, or a code held twice case-insensitively across
-- `home_inventory.asset_id` and `containers.code`) aborts the whole
-- transaction by violating a named CHECK, so nothing is written and the error
-- names the reason. A code may already be printed on a label, so the operator
-- resolves the clash by hand and reboots.
CREATE TEMP TABLE `preflight_0012` (
	`failure` text NOT NULL,
	CONSTRAINT `preflight_0012_id_collision` CHECK(`failure` <> 'id_collision'),
	CONSTRAINT `preflight_0012_code_collision` CHECK(`failure` <> 'code_collision')
);
--> statement-breakpoint
INSERT INTO `preflight_0012` (`failure`)
SELECT 'id_collision'
WHERE EXISTS (SELECT 1 FROM `home_inventory` h JOIN `containers` c ON c.`id` = h.`id`);
--> statement-breakpoint
INSERT INTO `preflight_0012` (`failure`)
SELECT 'code_collision'
WHERE EXISTS (
	SELECT 1
	FROM (
		SELECT `asset_id` AS `code` FROM `home_inventory` WHERE `asset_id` <> ''
		UNION ALL
		SELECT `code` FROM `containers` WHERE `code` <> ''
	)
	GROUP BY `code` COLLATE NOCASE
	HAVING count(*) > 1
);
--> statement-breakpoint
DROP TABLE `preflight_0012`;
--> statement-breakpoint
CREATE TABLE `media` (
	`sha256` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`stored_at` text NOT NULL,
	CONSTRAINT `ck_media_sha256` CHECK(length(`sha256`) = 64 AND `sha256` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT `ck_media_byte_size` CHECK(`byte_size` >= 0)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type_key` text,
	`fields` text DEFAULT '{}' NOT NULL,
	`note` text,
	`code` text,
	`external_ids` text DEFAULT '[]' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`lifecycle` text DEFAULT 'active' NOT NULL,
	`lifecycle_changed_at` text,
	`placement_kind` text NOT NULL,
	`location_id` text REFERENCES `locations`(`id`),
	`containing_item_id` text REFERENCES `items`(`id`),
	`previous_placement_kind` text,
	`previous_location_id` text,
	`previous_containing_item_id` text,
	`is_container` integer DEFAULT 0 NOT NULL,
	`access` text,
	`is_full` integer,
	`legacy_type` text,
	`location_text` text,
	`room` text,
	`item_id` text,
	`brand` text,
	`model` text,
	`condition` text DEFAULT 'Good',
	`in_use` integer,
	`deductible` integer,
	`purchase_date` text,
	`warranty_expires` text,
	`replacement_value` real,
	`resale_value` real,
	`purchase_transaction_id` text,
	`purchase_transaction_uri` text,
	`purchase_transaction_stale_at` text,
	`purchased_from_id` text,
	`purchased_from_name` text,
	`purchase_price` real,
	`owner_uri` text,
	`owner_stale_at` text,
	`source_ref` text,
	`notion_id` text,
	`last_edited_time` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`seq` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT `ck_items_placement` CHECK(
		(`placement_kind` = 'location' AND `location_id` IS NOT NULL AND `containing_item_id` IS NULL)
		OR (`placement_kind` = 'container' AND `containing_item_id` IS NOT NULL AND `location_id` IS NULL)
		OR (`placement_kind` = 'hand' AND `location_id` IS NULL AND `containing_item_id` IS NULL)
	),
	CONSTRAINT `ck_items_previous_placement` CHECK(
		(`previous_placement_kind` IS NULL AND `previous_location_id` IS NULL AND `previous_containing_item_id` IS NULL)
		OR (`placement_kind` = 'hand' AND (
			(`previous_placement_kind` IS 'location' AND `previous_location_id` IS NOT NULL AND `previous_containing_item_id` IS NULL)
			OR (`previous_placement_kind` IS 'container' AND `previous_containing_item_id` IS NOT NULL AND `previous_location_id` IS NULL)
		))
	),
	CONSTRAINT `ck_items_not_self_contained` CHECK(`containing_item_id` <> `id`),
	CONSTRAINT `ck_items_quantity` CHECK(`quantity` >= 1),
	CONSTRAINT `ck_items_lifecycle` CHECK(`lifecycle` IN ('active','retired','discarded','lost','destroyed')),
	CONSTRAINT `ck_items_is_container` CHECK(`is_container` IN (0, 1)),
	CONSTRAINT `ck_items_access` CHECK(
		(`access` IS NULL OR `access` IN ('open','closed')) AND ((`is_container` = 1) = (`access` IS NOT NULL))
	),
	CONSTRAINT `ck_items_is_full` CHECK(`is_full` IS NULL OR (`is_container` = 1 AND `is_full` IN (0, 1))),
	CONSTRAINT `ck_items_fields` CHECK(json_valid(`fields`) AND json_type(`fields`) = 'object'),
	CONSTRAINT `ck_items_external_ids` CHECK(json_valid(`external_ids`) AND json_type(`external_ids`) = 'array'),
	CONSTRAINT `ck_items_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
-- Containers first, so every `home_inventory.container_id` below already names
-- a live `items` row. Ids are kept verbatim; the preflight proved they are
-- disjoint from the item ids. A box sits where it was moved to, else where it
-- was packed, else nowhere (in hand, nothing remembered). `sealed` and `moved`
-- are closed boxes; `open` and `unpacked` are open ones. Every migrated box is
-- typed `storage_box`, the only way it stays a container under ADR-002 D1.
INSERT INTO `items` (
	`id`, `name`, `type_key`, `note`, `code`,
	`placement_kind`, `location_id`,
	`is_container`, `access`, `condition`,
	`last_edited_time`, `seq`, `created_at`, `updated_at`
)
SELECT
	`id`, `label`, 'storage_box', `notes`, NULLIF(`code`, ''),
	CASE WHEN coalesce(`destination_location_id`, `origin_location_id`) IS NULL THEN 'hand' ELSE 'location' END,
	coalesce(`destination_location_id`, `origin_location_id`),
	1, CASE WHEN `state` IN ('sealed', 'moved') THEN 'closed' ELSE 'open' END, NULL,
	`updated_at`, 0, `created_at`, `updated_at`
FROM `containers`;
--> statement-breakpoint
-- An item in a container is placed in the container alone; its own
-- `location_id` (which `moveContainer` could leave disagreeing with the box's)
-- is dropped from the row and kept on its `created` event below.
INSERT INTO `items` (
	`id`, `name`, `note`, `code`,
	`placement_kind`, `location_id`, `containing_item_id`,
	`legacy_type`, `location_text`, `room`, `item_id`, `brand`, `model`, `condition`,
	`in_use`, `deductible`, `purchase_date`, `warranty_expires`,
	`replacement_value`, `resale_value`,
	`purchase_transaction_id`, `purchase_transaction_uri`, `purchase_transaction_stale_at`,
	`purchased_from_id`, `purchased_from_name`, `purchase_price`,
	`owner_uri`, `owner_stale_at`, `source_ref`, `notion_id`,
	`last_edited_time`, `seq`, `created_at`, `updated_at`
)
SELECT
	`id`, `item_name`, `notes`, NULLIF(`asset_id`, ''),
	CASE
		WHEN `container_id` IS NOT NULL THEN 'container'
		WHEN `location_id` IS NOT NULL THEN 'location'
		ELSE 'hand'
	END,
	CASE WHEN `container_id` IS NULL THEN `location_id` END,
	`container_id`,
	`type`, `location`, `room`, `item_id`, `brand`, `model`, `condition`,
	`in_use`, `deductible`, `purchase_date`, `warranty_expires`,
	`replacement_value`, `resale_value`,
	`purchase_transaction_id`, `purchase_transaction_uri`, `purchase_transaction_stale_at`,
	`purchased_from_id`, `purchased_from_name`, `purchase_price`,
	`owner_uri`, `owner_stale_at`, `source_ref`, `notion_id`,
	`last_edited_time`, 0, `created_at`, `updated_at`
FROM `home_inventory`;
--> statement-breakpoint
CREATE UNIQUE INDEX `items_code` ON `items` (`code` COLLATE NOCASE);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_source_ref` ON `items` (`source_ref`);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_notion_id` ON `items` (`notion_id`);
--> statement-breakpoint
CREATE INDEX `items_seq` ON `items` (`seq`);
--> statement-breakpoint
CREATE INDEX `items_location` ON `items` (`location_id`);
--> statement-breakpoint
CREATE INDEX `items_containing` ON `items` (`containing_item_id`);
--> statement-breakpoint
CREATE INDEX `items_type` ON `items` (`type_key`);
--> statement-breakpoint
CREATE INDEX `items_lifecycle` ON `items` (`lifecycle`);
--> statement-breakpoint
CREATE INDEX `items_name` ON `items` (`name`);
--> statement-breakpoint
CREATE INDEX `items_in_hand` ON `items` (`id`) WHERE `placement_kind` = 'hand';
--> statement-breakpoint
CREATE INDEX `items_containers` ON `items` (`id`) WHERE `is_container` = 1;
--> statement-breakpoint
CREATE INDEX `items_purchase_uri` ON `items` (`purchase_transaction_uri`);
--> statement-breakpoint
CREATE INDEX `items_owner_uri` ON `items` (`owner_uri`);
--> statement-breakpoint
CREATE INDEX `items_warranty` ON `items` (`warranty_expires`);
--> statement-breakpoint
CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`fields` text NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`reason` text,
	`entity_revision` integer NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text,
	`actor_label` text,
	`mutation_id` text,
	`compensates_seq` integer REFERENCES `events`(`seq`),
	`client_time` text,
	`server_time` text NOT NULL,
	CONSTRAINT `ck_events_entity_kind` CHECK(`entity_kind` IN ('item','location')),
	CONSTRAINT `ck_events_actor_kind` CHECK(`actor_kind` IN ('device','web','service','migration')),
	CONSTRAINT `ck_events_fields` CHECK(json_valid(`fields`) AND json_type(`fields`) = 'array'),
	CONSTRAINT `ck_events_before` CHECK(json_valid(`before`) AND json_type(`before`) = 'object'),
	CONSTRAINT `ck_events_after` CHECK(json_valid(`after`) AND json_type(`after`) = 'object'),
	CONSTRAINT `ck_events_entity_revision` CHECK(`entity_revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `events_entity` ON `events` (`entity_kind`,`entity_id`,`seq`);
--> statement-breakpoint
CREATE TRIGGER `events_no_update` BEFORE UPDATE ON `events`
BEGIN
	SELECT RAISE(ABORT, 'events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `events_no_delete` BEFORE DELETE ON `events`
BEGIN
	SELECT RAISE(ABORT, 'events is append-only');
END;
--> statement-breakpoint
-- Every migrated item gets revision 1 and one `created` event from the
-- `migration` actor. Event field names are the wire's camelCase names, and a
-- placement is the wire's Placement object. A box's `created` event records
-- the access it was created with, so its history event below reads as a
-- change. An item whose old `location_id` disagreed with its container's
-- location keeps that discarded value in `before`.
INSERT INTO `events` (
	`entity_kind`, `entity_id`, `kind`, `fields`, `before`, `after`,
	`entity_revision`, `actor_kind`, `actor_id`, `actor_label`, `server_time`
)
SELECT
	'item', i.`id`, 'created',
	json_array('name', 'code', 'typeKey', 'placement', 'quantity', 'lifecycle', 'isContainer', 'access'),
	CASE
		WHEN h.`container_id` IS NOT NULL
			AND h.`location_id` IS NOT NULL
			AND h.`location_id` IS NOT (
				SELECT coalesce(b.`destination_location_id`, b.`origin_location_id`)
				FROM `containers` b WHERE b.`id` = h.`container_id`
			)
		THEN json_object('placement', json_object('kind', 'location', 'locationId', h.`location_id`))
		ELSE '{}'
	END,
	json_object(
		'name', i.`name`,
		'code', i.`code`,
		'typeKey', i.`type_key`,
		'placement', CASE
			WHEN c.`state` = 'moved' THEN
				CASE WHEN c.`origin_location_id` IS NULL THEN json_object('kind', 'hand')
				ELSE json_object('kind', 'location', 'locationId', c.`origin_location_id`) END
			WHEN i.`placement_kind` = 'location' THEN json_object('kind', 'location', 'locationId', i.`location_id`)
			WHEN i.`placement_kind` = 'container' THEN json_object('kind', 'container', 'itemId', i.`containing_item_id`)
			ELSE json_object('kind', 'hand')
		END,
		'quantity', i.`quantity`,
		'lifecycle', i.`lifecycle`,
		'isContainer', json(CASE WHEN i.`is_container` = 1 THEN 'true' ELSE 'false' END),
		'access', CASE
			WHEN c.`state` IS NULL THEN NULL
			WHEN c.`state` = 'unpacked' THEN 'closed'
			ELSE 'open'
		END
	),
	1, 'migration', '0012_items_single_identity', 'Migration', i.`created_at`
FROM `items` i
LEFT JOIN `containers` c ON c.`id` = i.`id`
LEFT JOIN `home_inventory` h ON h.`id` = i.`id`
ORDER BY i.`created_at`, i.`id`;
--> statement-breakpoint
-- `sealed`, `moved` and `unpacked` are no longer states (ADR-002 D1); each
-- becomes one history event, stamped with the box's last update.
INSERT INTO `events` (
	`entity_kind`, `entity_id`, `kind`, `fields`, `before`, `after`,
	`entity_revision`, `actor_kind`, `actor_id`, `actor_label`, `server_time`
)
SELECT
	'item', c.`id`, c.`state`,
	CASE WHEN c.`state` = 'moved' THEN json_array('placement', 'access') ELSE json_array('access') END,
	CASE c.`state`
		WHEN 'sealed' THEN json_object('access', 'open')
		WHEN 'unpacked' THEN json_object('access', 'closed')
		ELSE json_object(
			'placement', CASE WHEN c.`origin_location_id` IS NULL THEN json_object('kind', 'hand')
				ELSE json_object('kind', 'location', 'locationId', c.`origin_location_id`) END,
			'access', 'open'
		)
	END,
	CASE c.`state`
		WHEN 'sealed' THEN json_object('access', 'closed')
		WHEN 'unpacked' THEN json_object('access', 'open')
		ELSE json_object(
			'placement', CASE WHEN i.`location_id` IS NULL THEN json_object('kind', 'hand')
				ELSE json_object('kind', 'location', 'locationId', i.`location_id`) END,
			'access', 'closed'
		)
	END,
	1, 'migration', '0012_items_single_identity', 'Migration', c.`updated_at`
FROM `containers` c
JOIN `items` i ON i.`id` = c.`id`
WHERE c.`state` <> 'open'
ORDER BY c.`updated_at`, c.`id`;
--> statement-breakpoint
CREATE TABLE `item_photos_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL REFERENCES `items`(`id`) ON DELETE cascade,
	`media_sha256` text REFERENCES `media`(`sha256`),
	`file_path` text,
	`caption` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `ck_item_photos_source` CHECK(`media_sha256` IS NOT NULL OR `file_path` IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `item_photos_new` (`id`, `item_id`, `file_path`, `caption`, `position`, `created_at`)
SELECT `id`, `item_id`, `file_path`, `caption`, `sort_order`, `created_at` FROM `item_photos`;
--> statement-breakpoint
DROP TABLE `item_photos`;
--> statement-breakpoint
ALTER TABLE `item_photos_new` RENAME TO `item_photos`;
--> statement-breakpoint
CREATE INDEX `idx_item_photos_item` ON `item_photos` (`item_id`);
--> statement-breakpoint
CREATE TABLE `item_uploaded_files_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL REFERENCES `items`(`id`) ON DELETE cascade,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`uploaded_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `item_uploaded_files_new`
	(`id`, `item_id`, `file_name`, `file_path`, `mime_type`, `file_size`, `uploaded_at`, `created_at`)
SELECT `id`, `item_id`, `file_name`, `file_path`, `mime_type`, `file_size`, `uploaded_at`, `created_at`
FROM `item_uploaded_files`;
--> statement-breakpoint
DROP TABLE `item_uploaded_files`;
--> statement-breakpoint
ALTER TABLE `item_uploaded_files_new` RENAME TO `item_uploaded_files`;
--> statement-breakpoint
CREATE INDEX `idx_item_uploaded_files_item` ON `item_uploaded_files` (`item_id`);
--> statement-breakpoint
CREATE TABLE `item_documents_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL REFERENCES `items`(`id`) ON DELETE cascade,
	`paperless_document_id` integer NOT NULL,
	`document_type` text NOT NULL,
	`title` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `item_documents_new` (`id`, `item_id`, `paperless_document_id`, `document_type`, `title`, `created_at`)
SELECT `id`, `item_id`, `paperless_document_id`, `document_type`, `title`, `created_at` FROM `item_documents`;
--> statement-breakpoint
DROP TABLE `item_documents`;
--> statement-breakpoint
ALTER TABLE `item_documents_new` RENAME TO `item_documents`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_documents_pair` ON `item_documents` (`item_id`,`paperless_document_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_documents_item` ON `item_documents` (`item_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_documents_doc` ON `item_documents` (`paperless_document_id`);
--> statement-breakpoint
CREATE TABLE `item_connections_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_a_id` text NOT NULL REFERENCES `items`(`id`) ON DELETE cascade,
	`item_b_id` text NOT NULL REFERENCES `items`(`id`) ON DELETE cascade,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `chk_item_connections_order` CHECK(`item_a_id` < `item_b_id`)
);
--> statement-breakpoint
INSERT INTO `item_connections_new` (`id`, `item_a_id`, `item_b_id`, `created_at`)
SELECT `id`, `item_a_id`, `item_b_id`, `created_at` FROM `item_connections`;
--> statement-breakpoint
DROP TABLE `item_connections`;
--> statement-breakpoint
ALTER TABLE `item_connections_new` RENAME TO `item_connections`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_connections_pair` ON `item_connections` (`item_a_id`,`item_b_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_connections_a` ON `item_connections` (`item_a_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_connections_b` ON `item_connections` (`item_b_id`);
--> statement-breakpoint
CREATE TABLE `item_fixture_connections_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL REFERENCES `items`(`id`) ON DELETE cascade,
	`fixture_id` text NOT NULL REFERENCES `fixtures`(`id`) ON DELETE cascade,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `item_fixture_connections_new` (`id`, `item_id`, `fixture_id`, `created_at`)
SELECT `id`, `item_id`, `fixture_id`, `created_at` FROM `item_fixture_connections`;
--> statement-breakpoint
DROP TABLE `item_fixture_connections`;
--> statement-breakpoint
ALTER TABLE `item_fixture_connections_new` RENAME TO `item_fixture_connections`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_fixture_connections_pair` ON `item_fixture_connections` (`item_id`,`fixture_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_fixture_conn_item` ON `item_fixture_connections` (`item_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_fixture_conn_fixture` ON `item_fixture_connections` (`fixture_id`);
--> statement-breakpoint
-- No table references `home_inventory` any more, so its implicit DELETE
-- cascades nowhere; then nothing references `containers` either.
DROP TABLE `home_inventory`;
--> statement-breakpoint
DROP TABLE `containers`;
--> statement-breakpoint
-- `locations` is altered in place, not rebuilt: a rebuild's DROP would run an
-- implicit DELETE that nulls every `fixtures.location_id` and is refused by
-- `items.location_id`. Its `parent_id` keeps its missing foreign key; the
-- command layer rejects cycles.
-- `created_at`/`updated_at` are nullable because ADD COLUMN cannot take a
-- non-constant default; every existing row is backfilled below.
ALTER TABLE `locations` ADD COLUMN `revision` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `locations` ADD COLUMN `seq` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `locations` ADD COLUMN `created_at` text;
--> statement-breakpoint
ALTER TABLE `locations` ADD COLUMN `updated_at` text;
--> statement-breakpoint
ALTER TABLE `locations` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
CREATE INDEX `locations_seq` ON `locations` (`seq`);
--> statement-breakpoint
INSERT INTO `events` (
	`entity_kind`, `entity_id`, `kind`, `fields`, `before`, `after`,
	`entity_revision`, `actor_kind`, `actor_id`, `actor_label`, `server_time`
)
SELECT
	'location', `id`, 'created', json_array('name', 'parentId'), '{}',
	json_object('name', `name`, 'parentId', `parent_id`),
	1, 'migration', '0012_items_single_identity', 'Migration', `last_edited_time`
FROM `locations`
ORDER BY `last_edited_time`, `id`;
--> statement-breakpoint
UPDATE `items`
SET `seq` = (
	SELECT max(e.`seq`) FROM `events` e WHERE e.`entity_kind` = 'item' AND e.`entity_id` = `items`.`id`
);
--> statement-breakpoint
UPDATE `locations`
SET
	`seq` = (
		SELECT max(e.`seq`) FROM `events` e WHERE e.`entity_kind` = 'location' AND e.`entity_id` = `locations`.`id`
	),
	`created_at` = `last_edited_time`,
	`updated_at` = `last_edited_time`;
--> statement-breakpoint
CREATE TABLE `mutations` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`op` text NOT NULL,
	`entity_id` text NOT NULL,
	`status` text NOT NULL,
	`outcome` text NOT NULL,
	`received_at` text NOT NULL,
	CONSTRAINT `ck_mutations_status` CHECK(`status` IN ('applied','conflict','rejected')),
	CONSTRAINT `ck_mutations_outcome` CHECK(json_valid(`outcome`) AND json_type(`outcome`) = 'object')
);
--> statement-breakpoint
CREATE INDEX `mutations_actor` ON `mutations` (`actor_id`,`received_at`);
--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `sync_meta` (`key`, `value`) VALUES
	('epoch', lower(hex(randomblob(16)))),
	('min_protocol', '1');
