-- POPS-2647: record whether foreign-charge capture ran, not only what it found.
--
-- POPS-2604 captured FX on both import sources but met "a reader can tell 'no
-- foreign spend' from 'not captured'" for Amex alone, and only by accident of
-- that export's shape: Amex prints a merchant country on every row, so a stored
-- `country` doubles as proof capture ran. ANZ prints no country at all — its
-- parser infers one from the charge currency, inside the foreign-trailer branch
-- — so a domestic ANZ row is byte-identical to one imported before capture
-- existed.
--
-- Defaulting such a row to `AU` would invent data: no trailer means the charge
-- was BILLED in AUD, not that the merchant is Australian
-- (`CURSOR, AI POWERED IDE  SAN FRANCISCO`). This column states who looked
-- instead, so "captured, nothing to find" stops depending on a bank happening
-- to print a country. `src/contract/fx-capture.ts` holds the value set.
--
-- Every row 0072 could read is then marked, through the same
-- `finance_raw_row_foreign` function and therefore the same shape routing —
-- 0072 ran BEFORE this column existed, so it could not do it itself, and a
-- backfilled domestic ANZ row left unmarked would carry exactly the ambiguity
-- this column exists to remove.
--
-- A row of no recognised shape stays NULL, which is the honest answer: the
-- short four-column Amex export and a plain bank CSV are indistinguishable in
-- `raw_row`, and neither is distinguishable from a row whose `raw_row` no
-- parser has ever understood. NULL means "nobody declared anything" — not
-- "domestic", and not `unavailable`, which is a statement only an importer that
-- ran is entitled to make.
--
-- Idempotent: the update guards on the column being NULL, so a second run
-- rewrites nothing and cannot overwrite what an import declared. REQUIRED
-- before running against a real database: take a snapshot first (finance-audit
-- remediation policy). Rollback = restore the snapshot.

ALTER TABLE `transactions` ADD COLUMN `fx_capture_source` text;--> statement-breakpoint
UPDATE `transactions`
SET `fx_capture_source` = finance_raw_row_foreign(`raw_row`, 'capture_source')
WHERE `raw_row` IS NOT NULL
  AND `fx_capture_source` IS NULL
  AND finance_raw_row_foreign(`raw_row`, 'capture_source') IS NOT NULL;
