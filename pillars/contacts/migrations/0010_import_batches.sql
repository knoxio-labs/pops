CREATE TABLE contact_import_batches (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL REFERENCES source_accounts(id),
    collection_key TEXT NOT NULL,
    source_epoch INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TEXT NOT NULL
);

CREATE TABLE contact_import_rows (
    id TEXT PRIMARY KEY NOT NULL,
    batch_id TEXT NOT NULL REFERENCES contact_import_batches(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    preview TEXT NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0 CHECK (processed IN (0, 1)),
    UNIQUE (batch_id, ordinal)
);

CREATE TABLE contact_import_receipts (
    batch_id TEXT NOT NULL REFERENCES contact_import_batches(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    receipt TEXT NOT NULL,
    PRIMARY KEY (batch_id, idempotency_key)
);
