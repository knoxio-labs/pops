CREATE TABLE provider_accounts (
    account_id TEXT PRIMARY KEY REFERENCES source_accounts(id),
    provider TEXT NOT NULL CHECK(provider IN ('google', 'icloud')),
    owner_subject TEXT NOT NULL,
    epoch INTEGER NOT NULL DEFAULT 1 CHECK(epoch > 0),
    connected INTEGER NOT NULL DEFAULT 0 CHECK(connected IN (0, 1)),
    credential BLOB,
    CHECK((connected=1 AND credential IS NOT NULL) OR (connected=0 AND credential IS NULL))
);
CREATE TABLE provider_oauth_states (
    state_hash BLOB PRIMARY KEY CHECK(length(state_hash)=32),
    account_id TEXT NOT NULL REFERENCES provider_accounts(account_id) ON DELETE CASCADE,
    owner_subject TEXT NOT NULL,
    account_epoch INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    verifier BLOB NOT NULL
);
CREATE INDEX idx_provider_oauth_expiry ON provider_oauth_states(expires_at);
