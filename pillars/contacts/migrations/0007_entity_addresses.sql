-- One row per branch address a merchant entity is known at (ADR-053).
--
-- `entity_id` cascades: deleting an entity deletes its addresses with it —
-- an address with no entity to belong to is not a record worth keeping.
-- `value` is the address text verbatim, the same posture `entities.name`
-- takes toward the till's own wording: kept as printed, not normalised.
CREATE TABLE entity_addresses (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    last_edited_time TEXT NOT NULL
);

CREATE INDEX idx_entity_addresses_entity ON entity_addresses (entity_id);
