-- POPS-4648. Widens `ck_purchases_status` to admit `nothing_to_settle` and
-- backfills it onto every order already on disk that qualifies.
--
-- 51 orders (23 `amazon`, 28 `amazon-digital`) carry `total_cents = 0` —
-- free items, or orders cancelled before any charge existed. `deriveStatus`
-- (`src/db/services/purchase-status.ts`) never had anywhere to put them:
-- `listOrdersNeedingDerivedCharge` deliberately excludes a zero total from
-- ever getting a derived charge minted (a $0 derived charge would match
-- nothing while adding a row), so no coverage is ever computed for them,
-- and they sit at whatever they were created with — `awaiting_settlement`
-- — forever, indistinguishable in the unmatched queue from an order that
-- genuinely is waiting on a bank statement.
--
-- SQLite cannot widen a CHECK constraint with a plain ALTER TABLE, so
-- `purchases` is rebuilt (same pattern as finance's 0083_accounts.sql):
-- `CREATE TABLE __new_purchases` with the widened CHECK, copy every row
-- across unchanged, drop the old table, rename, recreate every index. No
-- column is added, dropped, renamed or retyped — this statement changes
-- only the CHECK's value list. The stored form of a couple of the existing
-- CHECKs table-qualifies their own columns (`"purchases"."status"`, from
-- how `ALTER TABLE ADD COLUMN` recorded them) — SQLite accepts that inside
-- `ALTER TABLE` but refuses it inside `CREATE TABLE`, table-name mismatch
-- or not, so every CHECK below is unqualified. Same predicate, same
-- constraint name, no behaviour change.
--
-- The backfill mirrors `deriveStatus`'s `nothing_to_settle` rule exactly:
-- zero total, and none of the order's charges is `capture`/`adjustment`/
-- `refund` (the same set `isResidualBearing` already names as money that
-- moved). `settled_cash` and `ignored` are excluded from the WHERE clause
-- rather than reachable by the CASE, the same way 0017 excluded them —
-- neither is ever derived from links or totals, so a status this migration
-- must never touch is never even computed for. Idempotent by construction,
-- as 0017 is: rerunning it (impossible in practice; the migrator is
-- hash-tracked) would update zero rows the second time.

CREATE TABLE `__new_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_order_id` text,
	`ingest_method` text NOT NULL,
	`ordered_at` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`merchant_entity_id` text,
	`merchant_entity_name` text,
	`settlement_mode` text DEFAULT 'unknown' NOT NULL,
	`payment_hint` text,
	`raw_ref` text,
	`checksum` text NOT NULL,
	`status` text DEFAULT 'awaiting_settlement' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`surcharge_cents` integer DEFAULT 0 NOT NULL CHECK (`surcharge_cents` >= 0),
	`ordered_at_offset_minutes` integer CONSTRAINT "ck_purchases_ordered_at_offset" CHECK(`ordered_at_offset_minutes` IS NULL OR (`ordered_at_offset_minutes` >= -840 AND `ordered_at_offset_minutes` <= 840)),
	`tax_included` integer CONSTRAINT "ck_purchases_tax_included" CHECK (`tax_included` IS NULL OR `tax_included` IN (0,1)),
	`discount_included` integer CONSTRAINT "ck_purchases_discount_included" CHECK (`discount_included` IS NULL OR `discount_included` IN (0,1)),
	`surcharge_included` integer CONSTRAINT "ck_purchases_surcharge_included" CHECK (`surcharge_included` IS NULL OR `surcharge_included` IN (0,1)),
	`shipping_included` integer CONSTRAINT "ck_purchases_shipping_included" CHECK (`shipping_included` IS NULL OR `shipping_included` IN (0,1)),
	`merchant_address_id` text,
	`merchant_address_name` text,
	FOREIGN KEY (`source`) REFERENCES `purchase_sources`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_purchases_ingest_method" CHECK(`ingest_method` IN ('email','export','upload','manual')),
	CONSTRAINT "ck_purchases_settlement_mode" CHECK(`settlement_mode` IN ('card','cash','unknown')),
	CONSTRAINT "ck_purchases_status" CHECK(`status` IN ('awaiting_settlement','linked','partial','settled_cash','ignored','nothing_to_settle')),
	CONSTRAINT "ck_purchases_currency" CHECK(length(`currency`) = 3),
	CONSTRAINT "ck_purchases_components_non_negative" CHECK(`subtotal_cents` >= 0 AND `shipping_cents` >= 0 AND `tax_cents` >= 0 AND `discount_cents` >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_purchases` (
	`id`, `source`, `source_order_id`, `ingest_method`, `ordered_at`, `currency`,
	`subtotal_cents`, `shipping_cents`, `tax_cents`, `discount_cents`, `total_cents`,
	`merchant_entity_id`, `merchant_entity_name`, `settlement_mode`, `payment_hint`,
	`raw_ref`, `checksum`, `status`, `created_at`, `updated_at`, `surcharge_cents`,
	`ordered_at_offset_minutes`, `tax_included`, `discount_included`, `surcharge_included`,
	`shipping_included`, `merchant_address_id`, `merchant_address_name`
)
SELECT
	`id`, `source`, `source_order_id`, `ingest_method`, `ordered_at`, `currency`,
	`subtotal_cents`, `shipping_cents`, `tax_cents`, `discount_cents`, `total_cents`,
	`merchant_entity_id`, `merchant_entity_name`, `settlement_mode`, `payment_hint`,
	`raw_ref`, `checksum`, `status`, `created_at`, `updated_at`, `surcharge_cents`,
	`ordered_at_offset_minutes`, `tax_included`, `discount_included`, `surcharge_included`,
	`shipping_included`, `merchant_address_id`, `merchant_address_name`
FROM `purchases`;
--> statement-breakpoint
DROP TABLE `purchases`;
--> statement-breakpoint
ALTER TABLE `__new_purchases` RENAME TO `purchases`;
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_checksum_unique` ON `purchases` (`checksum`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_purchases_source_order` ON `purchases` (`source`,`source_order_id`);
--> statement-breakpoint
CREATE INDEX `idx_purchases_source_ordered_at` ON `purchases` (`source`,`ordered_at`);
--> statement-breakpoint
CREATE INDEX `idx_purchases_status` ON `purchases` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_purchases_merchant_entity` ON `purchases` (`merchant_entity_id`);
--> statement-breakpoint
UPDATE purchases
SET
  status = 'nothing_to_settle',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE purchases.status NOT IN ('settled_cash', 'ignored', 'nothing_to_settle')
  AND purchases.total_cents = 0
  AND NOT EXISTS (
    SELECT 1 FROM purchase_charges pc
    WHERE pc.purchase_id = purchases.id
      AND pc.role IN ('capture', 'adjustment', 'refund')
  );
