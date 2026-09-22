INSERT INTO `events` (
	`entity_kind`, `entity_id`, `kind`, `fields`, `before`, `after`,
	`entity_revision`, `actor_kind`, `actor_id`, `server_time`
)
SELECT
	'item',
	`id`,
	'edited',
	json_array('fields'),
	json_object('fields', json(`fields`)),
	json_object('fields', json(json_remove(`fields`, '$."Footprint"'))),
	`revision` + 1,
	'migration',
	'0016_storage_box_dimensions',
	datetime('now')
FROM `items`
WHERE `type_key` = 'storage_box'
	AND json_type(`fields`, '$."Footprint"') IS NOT NULL;--> statement-breakpoint
UPDATE `items`
SET
	`fields` = json_remove(`fields`, '$."Footprint"'),
	`revision` = `revision` + 1,
	`seq` = (
		SELECT max(`seq`)
		FROM `events`
		WHERE `entity_kind` = 'item' AND `entity_id` = `items`.`id`
	)
WHERE `type_key` = 'storage_box'
	AND json_type(`fields`, '$."Footprint"') IS NOT NULL;--> statement-breakpoint
DELETE FROM `items_fts`;
