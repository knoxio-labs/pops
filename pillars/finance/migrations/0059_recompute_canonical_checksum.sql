-- CF005 (#3611): re-key transactions off the raw-row checksum onto the
-- canonical dedup identity (date + amount + normalized description + bank
-- reference). The old SHA256(JSON.stringify(row)) hashed the entire CSV row, so
-- two exports of the same charge that differed only in a free-text column (e.g.
-- a cardholder Address) produced different checksums and both inserted,
-- double-counting the charge.
--
-- Every stored checksum is recomputed via finance_canonical_checksum(), the
-- SQLite function registered in open-finance-db.ts before migrate() runs; it
-- derives the exact key the browser parser now hashes, so an existing row and a
-- re-import of the same charge collide.
--
-- The checksum index drops its UNIQUEness: known duplicate rows (same charge,
-- different free-text) now collapse to the same key and must coexist until the
-- Phase-D prod cleanup deletes them — recomputing under a UNIQUE index would
-- abort. Dedup is enforced in the app (findExistingChecksums), never by this
-- index, so a plain index is sufficient.

DROP INDEX IF EXISTS `idx_transactions_checksum`;
--> statement-breakpoint
UPDATE `transactions`
SET `checksum` = finance_canonical_checksum(`date`, `amount`, `description`, `raw_row`)
WHERE `checksum` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transactions_checksum` ON `transactions` (`checksum`);
