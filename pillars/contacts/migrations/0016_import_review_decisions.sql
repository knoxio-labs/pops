CREATE TABLE contact_import_review_states (
    row_id TEXT PRIMARY KEY NOT NULL REFERENCES contact_import_rows(id) ON DELETE CASCADE,
    entity_id TEXT,
    source_record_id TEXT,
    source_revision INTEGER,
    decisions TEXT NOT NULL DEFAULT '{}',
    CHECK ((entity_id IS NULL AND source_record_id IS NULL AND source_revision IS NULL)
        OR (entity_id IS NOT NULL AND source_record_id IS NOT NULL AND source_revision IS NOT NULL))
);

CREATE TABLE contact_import_review_receipts (
    batch_id TEXT NOT NULL REFERENCES contact_import_batches(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    receipt TEXT NOT NULL,
    PRIMARY KEY (batch_id, idempotency_key)
);
