-- What a line would have cost at the merchant's normal price, kept beside
-- what was actually charged. A receipt's `WAS $5.50` next to a `$3.50` that
-- was paid is a fact `unitPriceCents`/`lineTotalCents` cannot hold, and the
-- pillar threw it away until now.
--
-- Fused value-plus-provenance, the same idiom `kind`/`kind_confirmed_at`
-- already carries on this table: null `list_price_confirmed_at` means a
-- reading proposed the figure, non-null means a person is vouching for it.
-- Unlike `kind`, presence of a value does not itself mean asserted — a `WAS`
-- price read by the vision model is present and still only proposed, so the
-- write path carries an explicit assert signal rather than inferring one.
--
-- No backfill: no existing row has a list price to backfill from.
ALTER TABLE `purchase_items` ADD `list_price_cents` integer;--> statement-breakpoint
ALTER TABLE `purchase_items` ADD `list_price_confirmed_at` text CONSTRAINT "ck_purchase_items_list_price_confirmed_at" CHECK (`list_price_confirmed_at` IS NULL OR `list_price_cents` IS NOT NULL);
