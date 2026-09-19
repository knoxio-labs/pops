-- POPS-4051 (Inventory ADR-002, "items_fts"): the free-text search index over
-- items. `id` is unindexed (it identifies the row; nobody searches for it) so
-- the command layer can `DELETE ... WHERE id = ?` before every re-insert
-- without external-content bookkeeping, which FTS5 cannot key by a TEXT id
-- (`items.id` is a UUID, not a rowid). Populated by the command layer
-- (`src/domain/commands/search-index.ts`), not by triggers: the type label
-- comes from code, which a trigger cannot read.
CREATE VIRTUAL TABLE `items_fts` USING fts5(
	`id` UNINDEXED,
	`name`,
	`code`,
	`note`,
	`type_label`,
	`field_text`,
	`external_ids`
);
