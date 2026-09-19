-- POPS-4158: `0013_items_fts` was edited in place to add `tokenize =
-- 'trigram'` after it had already applied in production. drizzle's sqlite
-- migrator never re-runs an applied entry and does not compare its hash
-- (`open-inventory-db.ts`), so that edit was silently ignored: production's
-- `items_fts` stayed a plain `unicode61` index while the ranking code in
-- `search-handlers.ts` started assuming trigram substring matches. Applied
-- migrations are immutable here; `0013` is back to what it was on `main`, and
-- this entry does, as a new migration, what the edit tried to do in place.
--
-- `DROP` and recreate rather than `ALTER`: FTS5 has no way to add a
-- tokenizer to an existing virtual table. Dropping it loses every row it
-- held, which is why `rebuildSearchIndexFromItems`
-- (`backfill-search-index.ts`) repopulates it from live `items` right after
-- this migration applies, outside SQL, because a row's `field_text` and
-- `external_ids` columns depend on `findType` and per-item-type field kinds,
-- which only the command layer's `search-index.ts` can read.
DROP TABLE `items_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `items_fts` USING fts5(
	`id` UNINDEXED,
	`name`,
	`code`,
	`note`,
	`type_label`,
	`field_text`,
	`external_ids`,
	tokenize = 'trigram'
);
