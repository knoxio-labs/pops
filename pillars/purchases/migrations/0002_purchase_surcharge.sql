-- A fee the merchant adds at the till: a card surcharge, a small-order fee,
-- a service charge. Real money paid, and none of the existing components
-- describe it — it is not goods, not tax, not shipping, and not a discount.
--
-- Without it an ALDI card receipt cannot reconcile: $24.05 of groceries and
-- a 12c credit surcharge against a $24.17 total. Card surcharges are on
-- most Australian card receipts, so the alternative is sending a large
-- share of real receipts to manual review forever.
ALTER TABLE `purchases` ADD `surcharge_cents` integer DEFAULT 0 NOT NULL;
