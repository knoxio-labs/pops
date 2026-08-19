-- `sku` held a bare string whose meaning depended on which adapter wrote it,
-- and only one adapter ever writes one. `sku_scheme` names the namespace the
-- identifier lives in, so its reach is stated rather than assumed:
--
--   * `asin`     — Amazon's catalogue id, ten upper-case alphanumerics, and
--                  the same product wherever it appears.
--   * `merchant` — an identifier only the issuing merchant defines, so it
--                  means nothing outside the source that stated it.
--
-- The distinction is what stops a repeat-purchase grouping from merging an
-- ASIN with a store article number that happens to be the same string. Two
-- products collapsing into one corrupts spend attribution in a way nothing
-- afterwards makes visible.
--
-- The CHECK is on the column rather than the table because SQLite does not
-- extend a table-level constraint to a column added by a later migration —
-- the same reason `ck_purchase_items_kind_confirmed_at` is written that way.
-- It rejects a namespace with nothing under it — no row, and no blank
-- standing in for one — which is the half of the pair a column added to an
-- existing table can express. The other half — an identifier with no
-- namespace — cannot be reached without rebuilding the table, and a rebuild
-- here would drop `purchase_items` while foreign keys are enforced,
-- cascading every tag, note, unit and charge allocation off the lines it
-- copied. It is held instead by the write path carrying the pair as one
-- value from the request body to the insert, so no caller can name one
-- half; `db/__tests__/schema-invariants.test.ts` pins both directions.
ALTER TABLE `purchase_items` ADD `sku_scheme` text CONSTRAINT "ck_purchase_items_sku_scheme" CHECK (`sku_scheme` IS NULL OR (`sku` IS NOT NULL AND trim(`sku`) <> '' AND `sku_scheme` IN ('asin','merchant')));--> statement-breakpoint

-- An empty identifier is not one. The pre-0006 column accepted any string,
-- so a caller could post `sku: ""`; naming a namespace over it would mint an
-- identity out of nothing, which is precisely what NULL is here to say.
UPDATE `purchase_items` SET `sku` = NULL WHERE `sku` IS NOT NULL AND trim(`sku`) = '';--> statement-breakpoint

-- Backfill. Required rather than cosmetic: without it every stored ASIN keeps
-- claiming a namespace it never named, and the docstrings this migration adds
-- would be false against the rows already in the table.
--
-- One statement, so no row carrying an identifier is left without one.
--
-- `asin` is stamped only where the row can carry one: the order came from
-- the `amazon` source AND the identifier has an ASIN's shape. `purchases`.`source`
-- alone is not evidence of who wrote the row — it is a free-form label a
-- caller supplies — so on its own it would upgrade a hand-posted article
-- number into the one namespace that merges across sources, irreversibly.
-- Everything else takes `merchant`, the weakest claim there is, which is the
-- only honest reading of an identifier nobody qualified.
UPDATE `purchase_items`
SET `sku_scheme` = CASE
  WHEN `purchase_id` IN (SELECT `id` FROM `purchases` WHERE `source` = 'amazon')
    AND `sku` GLOB '[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]'
    THEN 'asin'
  ELSE 'merchant'
END
WHERE `sku` IS NOT NULL;--> statement-breakpoint

-- Scheme first, because "every line carrying this ASIN" is only a well-posed
-- question inside one namespace, and a lookup on the identifier alone is the
-- merge the pair exists to prevent.
DROP INDEX `idx_purchase_items_sku`;--> statement-breakpoint
CREATE INDEX `idx_purchase_items_sku` ON `purchase_items` (`sku_scheme`,`sku`);
