ALTER TABLE `item_types` ADD COLUMN `parent_type_id` text CONSTRAINT `ck_item_types_parent_type_id` CHECK(`parent_type_id` IS NULL OR `parent_type_id` <> `id`);
