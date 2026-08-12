-- Three unrelated things shared `purchase_item_tags`, and only one of them
-- was ever an item tag. This migration separates them by who asserted the
-- value, and gives both the tag and the kind a marker that tells a
-- judgement apart from a guess.
--
--   1. POPS item tags — product-grained, purchases' own vocabulary
--      (`fruit`, `healthy`). No source states one. They stay in
--      `purchase_item_tags`, which now carries `confirmed_at`.
--   2. Verbatim merchant prose — receipt promo wording, a printed unit
--      note. Evidence, not classification, and ORDERED, which the tag
--      table cannot represent: its primary key is `(item_id, tag)` and the
--      writer passes a Set, so duplicates collapse and order is lost. It
--      moves to `purchase_item_notes`, keyed `(item_id, position)`.
--   3. Two facts read off a single receipt character — `^` for a
--      promotional price and `#` for GST — become nullable booleans, where
--      NULL means the source did not state it.
--
-- `promotional_price` keeps an index. The one genuine cross-order question
-- the tag table ever answered for these rows was "was this on special", and
-- moving that onto an unindexed column would turn it into a table scan —
-- exactly what the join table exists to avoid.
ALTER TABLE `purchase_items` ADD `promotional_price` integer CONSTRAINT "ck_purchase_items_promotional_price" CHECK (`promotional_price` IS NULL OR `promotional_price` IN (0,1));--> statement-breakpoint
ALTER TABLE `purchase_items` ADD `gst_applicable` integer CONSTRAINT "ck_purchase_items_gst_applicable" CHECK (`gst_applicable` IS NULL OR `gst_applicable` IN (0,1));--> statement-breakpoint

-- `merchant_category` is documented as the merchant's own category string,
-- kept verbatim. No shipped source states a category: the Amazon DSAR
-- bundle's 28 columns contain none, and what the adapter mapped in was
-- `Product Condition` (`New`/`Used`). A condition is not a category, so it
-- gets its own column and `merchant_category` goes back to meaning what it
-- says — empty until a source actually states one.
ALTER TABLE `purchase_items` ADD `merchant_condition` text;--> statement-breakpoint

-- The marker that makes `kind` readable. NULL means a classification pass
-- proposed the value and a re-run may reconsider it; non-null means the
-- value was asserted — by a human through the item PATCH, or by a source
-- that stated it outright at ingest — and nothing may re-derive it. Same
-- idiom as `purchase_charge_links.confirmed_at`, which reconciliation
-- already runs on.
--
-- The CHECK is on the column rather than the table because SQLite does not
-- extend a table-level constraint to a column added by a later migration.
-- It makes the pair total: there is no such thing as a confirmed absence of
-- a kind, so a consumer that has a confirmation always has a value to go
-- with it.
ALTER TABLE `purchase_items` ADD `kind_confirmed_at` text CONSTRAINT "ck_purchase_items_kind_confirmed_at" CHECK (`kind_confirmed_at` IS NULL OR `kind` IS NOT NULL);--> statement-breakpoint

ALTER TABLE `purchase_item_tags` ADD `confirmed_at` text;--> statement-breakpoint

CREATE TABLE `purchase_item_notes` (
	`item_id` text NOT NULL,
	`position` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`item_id`, `position`),
	FOREIGN KEY (`item_id`) REFERENCES `purchase_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- Both hot predicates read the pair, so the index carries it. Dropping the
-- single-column index is safe: nothing selects on `kind` alone once the
-- confirmation marker exists, because a consumer that ignores it cannot
-- tell a proposal from a fact.
DROP INDEX `idx_purchase_items_kind`;--> statement-breakpoint
CREATE INDEX `idx_purchase_items_kind` ON `purchase_items` (`kind`,`kind_confirmed_at`);--> statement-breakpoint
CREATE INDEX `idx_purchase_items_promotional_price` ON `purchase_items` (`promotional_price`) WHERE `promotional_price` = 1;--> statement-breakpoint

-- Backfill. Required, not optional: without it the new docstrings are false
-- against rows already in the table on day one.
--
-- Every row in `purchase_item_tags` today was written by an ingest adapter
-- — the Woolworths receipt mapper and the receipt drop-zone are the only
-- writers that have ever existed — so all of it is merchant prose except
-- the literal `promotional-price` marker.
--
-- Known loss: `purchase_item_tags` has no position column, so the order the
-- notes were printed in is already gone and they come back alphabetical.
-- Both backfills are re-runnable from the original exports, so an operator
-- who wants exact fidelity can `DELETE /purchases/:id` and re-ingest the
-- source instead.
INSERT INTO `purchase_item_notes` (`item_id`, `position`, `note`, `created_at`)
SELECT `item_id`,
       ROW_NUMBER() OVER (PARTITION BY `item_id` ORDER BY `tag`) - 1,
       `tag`,
       `created_at`
FROM `purchase_item_tags`
WHERE `tag` <> 'promotional-price';--> statement-breakpoint

-- A Woolworths receipt states the `^` on every line it applies to, so the
-- absence of one is the merchant saying "not on special" — 0, not unknown.
-- Every other source states nothing, and stays NULL.
UPDATE `purchase_items` SET `promotional_price` = 0
WHERE `purchase_id` IN (SELECT `id` FROM `purchases` WHERE `source` = 'woolworths');--> statement-breakpoint
UPDATE `purchase_items` SET `promotional_price` = 1
WHERE `id` IN (SELECT `item_id` FROM `purchase_item_tags` WHERE `tag` = 'promotional-price');--> statement-breakpoint

UPDATE `purchase_items` SET `gst_applicable` = 0
WHERE `purchase_id` IN (SELECT `id` FROM `purchases` WHERE `source` = 'woolworths');--> statement-breakpoint
UPDATE `purchase_items` SET `gst_applicable` = 1, `merchant_category` = NULL
WHERE `merchant_category` = 'gst-applicable';--> statement-breakpoint

-- Amazon's `Product Condition`. Moved rather than dropped: `Used` on 3 rows
-- of 943 is thin, but it is a fact the merchant stated and this migration
-- is not the place to decide it is worthless. Scoped to the source rather
-- than to "everything left", so a category someone entered by hand through
-- `POST /purchases` — the one way this column could ever hold what it
-- claims — survives untouched.
UPDATE `purchase_items`
SET `merchant_condition` = `merchant_category`, `merchant_category` = NULL
WHERE `merchant_category` IS NOT NULL
  AND `purchase_id` IN (SELECT `id` FROM `purchases` WHERE `source` = 'amazon');--> statement-breakpoint

DELETE FROM `purchase_item_tags`;
