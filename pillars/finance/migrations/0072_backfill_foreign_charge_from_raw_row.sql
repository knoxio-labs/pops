-- Backfill `country` and the foreign-charge columns from the import row every
-- transaction already carries in `raw_row`.
--
-- POPS-2604 taught both importers to capture these fields, and deliberately did
-- not backfill: a data migration folded into a capture fix is reviewable as
-- neither. It also assumed no backfill was possible. It is — `raw_row` holds
-- `JSON.stringify(row)` over the WHOLE import row, including the Amex columns
-- the wizard never mapped and the ANZ description before it was truncated to
-- the merchant name, so the source data never left the database.
--
-- The parse runs through `finance_raw_row_foreign` (registered in
-- `open-finance-db.ts`), which routes each row to the parser that owns its
-- export format rather than re-reading either format here. A backfilled row and
-- a freshly imported one therefore agree by construction.
--
-- Three shapes are reachable: the long Amex export's columns, the ANZ
-- description trailer (`GITHUB  INC.  GITHUB.COM  100.00  USD 5.03 AUD`), and an
-- ANZ PDF statement line. The short four-column Amex export carries no foreign
-- detail at all; those rows are left untouched rather than written zero, because
-- "no foreign spend" and "never captured" are different answers.
--
-- A row that STATES foreign detail the parser cannot read means the format
-- drifted, and recording it as domestic is unrecoverable, so the guard table's
-- CHECK aborts the whole pending batch instead — the shape 0066 uses.
--
-- Both updates guard on the target column being NULL, so a second run is a
-- no-op and neither can overwrite a value an import already captured.

CREATE TABLE `_raw_row_foreign_backfill_guard` (
	`unreadable_rows` integer NOT NULL CHECK (`unreadable_rows` = 0)
);--> statement-breakpoint
INSERT INTO `_raw_row_foreign_backfill_guard` (`unreadable_rows`)
SELECT count(*) FROM `transactions`
WHERE `raw_row` IS NOT NULL
  AND `foreign_currency` IS NULL
  AND finance_raw_row_foreign(`raw_row`, 'unreadable') = 1;--> statement-breakpoint
UPDATE `transactions`
SET `foreign_amount_minor` = finance_raw_row_foreign(`raw_row`, 'amount_minor'),
    `foreign_currency` = finance_raw_row_foreign(`raw_row`, 'currency'),
    `fx_fee_cents` = finance_raw_row_foreign(`raw_row`, 'fee_cents')
WHERE `raw_row` IS NOT NULL
  AND `foreign_currency` IS NULL
  AND finance_raw_row_foreign(`raw_row`, 'currency') IS NOT NULL;--> statement-breakpoint
UPDATE `transactions`
SET `country` = finance_raw_row_foreign(`raw_row`, 'country')
WHERE `raw_row` IS NOT NULL
  AND `country` IS NULL
  AND finance_raw_row_foreign(`raw_row`, 'country') IS NOT NULL;--> statement-breakpoint
DROP TABLE `_raw_row_foreign_backfill_guard`;
