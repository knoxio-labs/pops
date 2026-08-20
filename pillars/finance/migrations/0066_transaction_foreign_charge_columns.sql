-- Promote the ANZ importer's foreign-charge detail out of `notes` into typed
-- columns, then hand `notes` back to the user.
--
-- `foreign_amount_minor` is in the charge currency's own ISO-4217 minor units:
-- 1100 is 1100 JPY (no minor unit) and 11.00 USD. `fx_fee_cents` is the
-- issuer's foreign-transaction FEE in AUD cents (~3% of the charge), not the
-- converted AUD total, which the statement never states separately.
--
-- The candidate set is every note ending in the exact suffix the importer
-- wrote, matched with GLOB so it stays case-sensitive — LIKE would sweep in a
-- user's own lowercase text. Each candidate must then parse via
-- `finance_anz_fx_note` (registered in `open-finance-db.ts`, which reuses the
-- importer's own converter). A candidate that does not parse means the format
-- drifted, and clearing a note this migration could not read is unrecoverable,
-- so the guard table's CHECK aborts the whole pending batch instead. Zero-decimal
-- currencies write their thousands with a SPACE (`1 100 JPY`) and are a quarter
-- of the affected rows: a parser that skips them would otherwise clear them
-- silently.

ALTER TABLE `transactions` ADD COLUMN `foreign_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `foreign_currency` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `fx_fee_cents` integer;--> statement-breakpoint
CREATE TABLE `_anz_fx_backfill_guard` (
	`unreadable_notes` integer NOT NULL CHECK (`unreadable_notes` = 0)
);--> statement-breakpoint
INSERT INTO `_anz_fx_backfill_guard` (`unreadable_notes`)
SELECT count(*) FROM `transactions`
WHERE `notes` GLOB '* AUD fx fee'
  AND finance_anz_fx_note(`notes`, 'currency') IS NULL;--> statement-breakpoint
UPDATE `transactions`
SET `foreign_amount_minor` = finance_anz_fx_note(`notes`, 'amount_minor'),
    `foreign_currency` = finance_anz_fx_note(`notes`, 'currency'),
    `fx_fee_cents` = finance_anz_fx_note(`notes`, 'fee_cents'),
    `notes` = NULL
WHERE `notes` GLOB '* AUD fx fee'
  AND finance_anz_fx_note(`notes`, 'currency') IS NOT NULL;--> statement-breakpoint
DROP TABLE `_anz_fx_backfill_guard`;
