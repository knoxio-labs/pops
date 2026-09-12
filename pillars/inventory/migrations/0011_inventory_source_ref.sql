-- POPS-2433 — an idempotency key for a create driven by another pillar's
-- fan-out, e.g. `pops://purchases/order/<id>/item/<id>`. NULL for a row a
-- person typed in directly.
--
-- Unique so two concurrent accepts of the same external slot cannot mint two
-- assets: the second insert's UNIQUE violation is the DB-level guarantee the
-- in-process ordering alone could not give (POPS-2433's audit found the
-- in-process fix insufficient on its own). SQLite's UNIQUE index permits any
-- number of NULLs, so rows with no source reference are unaffected.
ALTER TABLE `home_inventory` ADD COLUMN `source_ref` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_source_ref` ON `home_inventory` (`source_ref`);
