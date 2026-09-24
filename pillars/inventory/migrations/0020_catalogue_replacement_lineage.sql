ALTER TABLE `item_types` ADD COLUMN `replaced_by` text CONSTRAINT `ck_item_types_replaced_by` CHECK(`replaced_by` IS NULL OR (`archived_at` IS NOT NULL AND `replaced_by` <> `id`));--> statement-breakpoint
ALTER TABLE `item_type_fields` ADD COLUMN `replaced_by` text CONSTRAINT `ck_item_type_fields_replaced_by` CHECK(`replaced_by` IS NULL OR (`archived_at` IS NOT NULL AND `replaced_by` <> `id`));
