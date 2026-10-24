CREATE TABLE provider_sync_runs (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES provider_accounts(account_id),
    account_epoch INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running','completed','failed','cancelled')),
    error_code TEXT,
    started_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_provider_one_running_account ON provider_sync_runs(account_id) WHERE status='running';
CREATE TABLE provider_run_collections (
    run_id TEXT NOT NULL REFERENCES provider_sync_runs(id),
    collection_key TEXT NOT NULL,
    full_snapshot INTEGER NOT NULL CHECK(full_snapshot IN (0,1)),
    complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1)),
    base_checkpoint TEXT,
    continuation TEXT,
    checkpoint TEXT,
    PRIMARY KEY(run_id,collection_key)
);
CREATE TABLE provider_run_changes (
    run_id TEXT NOT NULL,
    collection_key TEXT NOT NULL,
    record_key TEXT NOT NULL,
    observation TEXT NOT NULL,
    etag TEXT,
    uid TEXT,
    PRIMARY KEY(run_id,collection_key,record_key),
    FOREIGN KEY(run_id,collection_key) REFERENCES provider_run_collections(run_id,collection_key)
);
CREATE TABLE provider_run_seen (
    run_id TEXT NOT NULL,
    collection_key TEXT NOT NULL,
    record_key TEXT NOT NULL,
    PRIMARY KEY(run_id,collection_key,record_key),
    FOREIGN KEY(run_id,collection_key) REFERENCES provider_run_collections(run_id,collection_key)
);
CREATE TABLE provider_run_cursors (
    run_id TEXT NOT NULL,
    collection_key TEXT NOT NULL,
    cursor_hash TEXT NOT NULL,
    PRIMARY KEY(run_id,collection_key,cursor_hash),
    FOREIGN KEY(run_id,collection_key) REFERENCES provider_run_collections(run_id,collection_key)
);
CREATE TABLE provider_records (
    account_id TEXT NOT NULL REFERENCES provider_accounts(account_id),
    collection_key TEXT NOT NULL,
    record_key TEXT NOT NULL,
    payload TEXT,
    etag TEXT,
    uid TEXT,
    active INTEGER NOT NULL CHECK(active IN (0,1)),
    PRIMARY KEY(account_id,collection_key,record_key),
    CHECK(active=0 OR payload IS NOT NULL)
);
CREATE TABLE provider_collection_states (
    account_id TEXT NOT NULL REFERENCES provider_accounts(account_id),
    collection_key TEXT NOT NULL,
    checkpoint TEXT,
    latest_run_id TEXT NOT NULL REFERENCES provider_sync_runs(id),
    PRIMARY KEY(account_id,collection_key)
);
CREATE TABLE provider_batch_guards (
    batch_id TEXT PRIMARY KEY REFERENCES contact_import_batches(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES provider_sync_runs(id)
);
