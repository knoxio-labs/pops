-- POPS-30: an API importer can see a row before it settles. `pending` is set
-- on insert from the source's own status and cleared in place when the same
-- row (same checksum) comes back settled. Every file-imported row is settled
-- by definition, hence the default.
ALTER TABLE `transactions` ADD `pending` integer DEFAULT 0 NOT NULL;
