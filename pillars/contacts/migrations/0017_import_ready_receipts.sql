CREATE TABLE contact_import_ready_receipts (
    batch_id TEXT NOT NULL REFERENCES contact_import_batches(id),
    idempotency_key TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    receipt TEXT NOT NULL,
    PRIMARY KEY(batch_id,idempotency_key)
);
CREATE TRIGGER contact_import_ready_receipts_immutable_update BEFORE UPDATE ON contact_import_ready_receipts
BEGIN SELECT RAISE(ABORT,'ready import receipt is immutable'); END;
CREATE TRIGGER contact_import_ready_receipts_immutable_delete BEFORE DELETE ON contact_import_ready_receipts
BEGIN SELECT RAISE(ABORT,'ready import receipt is immutable'); END;
CREATE TABLE contact_import_ready_epoch (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    revision INTEGER NOT NULL CHECK(revision>=0)
);
INSERT INTO contact_import_ready_epoch VALUES(1,0);
CREATE TRIGGER contact_import_batches_ready_insert AFTER INSERT ON contact_import_batches
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER contact_import_batches_ready_update AFTER UPDATE ON contact_import_batches
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER contact_import_batches_ready_delete AFTER DELETE ON contact_import_batches
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER contact_import_rows_ready_insert AFTER INSERT ON contact_import_rows
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER contact_import_rows_ready_update AFTER UPDATE ON contact_import_rows
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER contact_import_rows_ready_delete AFTER DELETE ON contact_import_rows
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER contact_import_review_states_ready_insert AFTER INSERT ON contact_import_review_states
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER contact_import_review_states_ready_update AFTER UPDATE ON contact_import_review_states
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER contact_import_review_states_ready_delete AFTER DELETE ON contact_import_review_states
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_batch_guards_ready_insert AFTER INSERT ON provider_batch_guards
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_batch_guards_ready_update AFTER UPDATE ON provider_batch_guards
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_batch_guards_ready_delete AFTER DELETE ON provider_batch_guards
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_collection_states_ready_insert AFTER INSERT ON provider_collection_states
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_collection_states_ready_update AFTER UPDATE ON provider_collection_states
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_collection_states_ready_delete AFTER DELETE ON provider_collection_states
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_accounts_ready_insert AFTER INSERT ON provider_accounts
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_accounts_ready_delete AFTER DELETE ON provider_accounts
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER provider_accounts_ready_update AFTER UPDATE ON provider_accounts
WHEN OLD.epoch<>NEW.epoch OR OLD.connected<>NEW.connected
BEGIN UPDATE contact_import_ready_epoch SET revision=revision+1 WHERE singleton=1; END;
