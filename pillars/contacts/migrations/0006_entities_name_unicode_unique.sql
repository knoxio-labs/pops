-- Replace ASCII-only case folding with the Unicode case-and-diacritic fold
-- decided in `entities::name_identity` (POPS-3572).
--
-- `COLLATE NOCASE` is SQLite's built-in collation and folds ASCII case
-- only: `Padaria` and `PADARIA` collided as intended, but `São João` and
-- `SÃO JOÃO` did not, because `ã`/`Ã` sit outside ASCII — so a Brazilian
-- merchant arriving once by receipt (original spelling) and once by card
-- descriptor (upper-cased, often accent-stripped) minted two entities.
--
-- `UNICODE_NOCASE` is a custom collation registered on every connection in
-- `db::connect`, before this migration runs, so it is already available
-- here. It folds full Unicode case AND diacritics (`SÃO` / `São` / `Sao`
-- all fold to `sao`) — see `entities::name_identity` for why diacritics
-- fold too: purchases' own merchant-name matching already treats them as
-- one, and this stops contacts disagreeing with it about identity.
--
-- Dropping and recreating the index, rather than altering it in place, IS
-- the "check existing rows for collisions" step the ticket asked for:
-- `CREATE UNIQUE INDEX` scans every existing row under the new rule and
-- refuses to create the index — failing this migration, and boot with it —
-- if two rows would now collide. That is the deliberate behaviour: a
-- silent merge or a silently dropped constraint would both be worse than a
-- deployer having to resolve one visible collision by hand.
DROP INDEX idx_entities_name_nocase;

CREATE UNIQUE INDEX idx_entities_name_unicode_nocase ON entities (name COLLATE UNICODE_NOCASE);
