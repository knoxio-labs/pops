-- Whether tax, discount, surcharge and shipping are already inside the
-- order's line prices, or sit on top of them.
--
-- Australian receipts print both conventions and a reading cannot always
-- tell which it found. Without a place to record the basis, a receipt whose
-- figures are individually right still fails its own total check, and the
-- person correcting it has no field to fix — the numbers are all correct,
-- the arithmetic assumption is not.
--
-- Four independent nullable booleans, not one enum: each of tax, discount,
-- surcharge and shipping can independently be inside or on top of the line
-- prices, and this is the existing idiom for this table (see
-- `ordered_at_offset_minutes` above and `promotional_price` /
-- `gst_applicable` on `purchase_items`). NULL means not stated — every
-- adapter that predates this migration, and every adapter that never
-- learns to state it. Nothing is backfilled, for the same reason migration
-- 0012 declined to: a historical row's arithmetic basis is not recoverable
-- from the row.
ALTER TABLE `purchases` ADD `tax_included` integer CONSTRAINT "ck_purchases_tax_included" CHECK (`tax_included` IS NULL OR `tax_included` IN (0,1));--> statement-breakpoint
ALTER TABLE `purchases` ADD `discount_included` integer CONSTRAINT "ck_purchases_discount_included" CHECK (`discount_included` IS NULL OR `discount_included` IN (0,1));--> statement-breakpoint
ALTER TABLE `purchases` ADD `surcharge_included` integer CONSTRAINT "ck_purchases_surcharge_included" CHECK (`surcharge_included` IS NULL OR `surcharge_included` IN (0,1));--> statement-breakpoint
ALTER TABLE `purchases` ADD `shipping_included` integer CONSTRAINT "ck_purchases_shipping_included" CHECK (`shipping_included` IS NULL OR `shipping_included` IN (0,1));
