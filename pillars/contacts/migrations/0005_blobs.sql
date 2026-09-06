-- Generic blob storage backing the entity avatar/poster asset ids (and any
-- future asset reference in this pillar). Bytes live in a column in this same
-- SQLite file rather than on the filesystem — see the "Blob storage" note in
-- pillars/contacts/README.md for why: it is the same call finance's
-- ADR-050 made for institution logos, for the same reason (this pillar's
-- litestream config already replicates the whole `contacts.db` file, so a
-- filesystem tree would need its own, separate backup mechanism this repo has
-- no generic answer for).
--
-- A row is never updated in place: replacing an asset always inserts a NEW
-- row and the referencing column (`entities.avatar_asset_id` /
-- `poster_asset_id`) is repointed to it, so a blob's bytes never change once
-- written.
CREATE TABLE blobs (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    byte_length INTEGER NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL
);
