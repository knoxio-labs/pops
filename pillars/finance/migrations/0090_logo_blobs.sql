-- POPS-2804. Storage for uploaded institution logos. See ADR-050
-- (docs/architecture/adr-050-finance-logo-storage.md) for why this is a table
-- in finance's own SQLite rather than a filesystem path or a shared asset
-- service: it rides litestream's existing whole-file replication of
-- `finance.db` for free, and needs no new volume, Dockerfile mkdir/chown, or
-- backup mechanism.
--
-- No FOREIGN KEY from `institutions.logo_asset_id` to this table — that
-- column predates this migration (POPS-2803) and stays a plain nullable
-- `text`, so a row here can be deleted (on replace or removal) without a
-- constraint check racing the `UPDATE institutions SET logo_asset_id = ...`
-- that repoints it. The service layer writes both in one order: insert the
-- new blob, repoint the column, THEN delete the old blob — never the reverse.
CREATE TABLE `logo_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`data` blob NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
