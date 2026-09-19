-- POPS-4051 (Inventory ADR-002, "items_fts"): the free-text search index over
-- items. `id` is unindexed (it identifies the row; nobody searches for it) so
-- the command layer can `DELETE ... WHERE id = ?` before every re-insert
-- without external-content bookkeeping, which FTS5 cannot key by a TEXT id
-- (`items.id` is a UUID, not a rowid). Populated by the command layer
-- (`src/domain/commands/search-index.ts`), not by triggers: the type label
-- comes from code, which a trigger cannot read.
--
-- POPS-3329: `tokenize = 'trigram'` matches the phone's own `item_fts`
-- (`clients/ios/Packages/InventoryReplica/Sources/InventoryReplica/ReplicaSchema.swift`),
-- which answers a mid-word
-- substring ("dgeh" inside "Sledgehammer") the default `unicode61` tokenizer
-- cannot: it only matches whole tokens or a token prefix. A query shorter
-- than three characters has no trigram to look up and falls back to `LIKE`
-- (`src/api/rest/search-handlers.ts`), the same threshold the phone uses.
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
