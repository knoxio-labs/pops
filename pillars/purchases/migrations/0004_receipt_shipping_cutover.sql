-- Data only. No column is added, dropped or altered here.
--
-- Before shipping had its own term in the receipt gate, a delivery charge
-- was read into `surcharges` and written to `surcharge_cents`. Nothing
-- recorded which surcharge was a delivery, so those rows cannot be split
-- afterwards, and inventing the split is the one thing this pillar refuses
-- everywhere else. They are tagged instead.
--
-- The tag means "this surcharge MAY include delivery", not "this row has
-- delivery". `surcharge_cents > 0` also catches every card surcharge, which
-- is most Australian card receipts. That over-tags, deliberately: the
-- alternative asserts a clean figure for rows where none exists.
--
-- No cutover timestamp is needed, which is the point of doing it here. The
-- migrator runs inside `openPurchasesDb` before the process serves anything
-- and is hash-tracked, so every row this statement can see is by
-- construction pre-cutover, and a fresh deployment gets a no-op.
--
-- The column list is not optional. `purchase_tags` has three columns —
-- `created_at` carries a default — and an `INSERT ... SELECT` without one
-- fails outright with "table purchase_tags has 3 columns but 2 values were
-- supplied". The composite primary key is what makes `OR IGNORE`
-- idempotent.
--
-- The literal below is `SHIPPING_UNCERTAIN` in
-- `src/ingest/receipt/purchase.ts`. SQL cannot import it, so a test asserts
-- the two agree rather than trusting them to.
INSERT OR IGNORE INTO `purchase_tags` (`purchase_id`, `tag`)
SELECT `id`, 'shipping-uncertain' FROM `purchases`
WHERE `source` = 'receipt' AND `surcharge_cents` > 0;
