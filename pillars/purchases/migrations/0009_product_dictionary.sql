-- A durable, correctable product identity for the lines that state none.
--
-- Two of the three shipped adapters write `sku IS NULL` on every line, so
-- the only evidence of what a line is, is the text a till printed. Every
-- aggregate already groups those lines on the normalised printed name, but
-- that grouping is computed on the fly and forgotten, which means there is
-- nothing a human can point at to say "these two wordings are one product"
-- or "that merge is wrong".
--
-- `purchase_products` is the thing a human recognises; each row in
-- `purchase_product_aliases` is one printed wording that resolves to it.
-- Pointing two aliases at one product is how `CHK BRST 1KG` and
-- `Chicken Breast 1kg` become one thing, and deleting or repointing an alias
-- is how that is undone.
--
-- Nothing is backfilled. The proposal pass mints entries from lines already
-- in the table when it is asked to, and a database that never runs it keeps
-- exactly the behaviour it has today: an on-the-fly group per normalised
-- name, resolved fresh on every read.
CREATE TABLE `purchase_products` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_product_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`scope_key` text NOT NULL,
	`source` text NOT NULL,
	`normalised_name` text NOT NULL,
	`printed_name` text NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `purchase_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- One printed wording resolves to exactly one product, so a line's product
-- needs no tie-break rule for anybody to disagree about.
CREATE UNIQUE INDEX `uq_purchase_product_aliases_lookup` ON `purchase_product_aliases` (`scope_key`,`normalised_name`);
--> statement-breakpoint
CREATE INDEX `idx_purchase_product_aliases_product` ON `purchase_product_aliases` (`product_id`);
--> statement-breakpoint
CREATE INDEX `idx_purchase_product_aliases_source` ON `purchase_product_aliases` (`source`);
