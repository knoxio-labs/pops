CREATE TABLE contact_directory_revision (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    revision INTEGER NOT NULL CHECK(revision >= 0)
);
INSERT INTO contact_directory_revision VALUES(1, 0);

CREATE TABLE entity_redirects (
    member_id TEXT PRIMARY KEY REFERENCES entities(id),
    canonical_id TEXT NOT NULL REFERENCES entities(id),
    CHECK(member_id <> canonical_id)
);
CREATE INDEX idx_entity_redirects_canonical ON entity_redirects(canonical_id);

CREATE TABLE merge_selections (
    canonical_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    field TEXT NOT NULL,
    owner_entity_id TEXT REFERENCES entities(id),
    point_id TEXT REFERENCES contact_points(id) ON DELETE CASCADE,
    source_history_id TEXT REFERENCES source_record_history(id),
    PRIMARY KEY(canonical_id, field),
    CHECK((owner_entity_id IS NOT NULL) + (point_id IS NOT NULL) + (source_history_id IS NOT NULL) = 1)
);
CREATE TABLE keep_separate (
    left_id TEXT NOT NULL REFERENCES entities(id),
    right_id TEXT NOT NULL REFERENCES entities(id),
    PRIMARY KEY(left_id, right_id),
    CHECK(left_id < right_id)
);
CREATE TABLE merge_operations (
    id TEXT PRIMARY KEY,
    canonical_id TEXT NOT NULL,
    member_ids TEXT NOT NULL,
    before_redirects TEXT NOT NULL,
    before_selections TEXT NOT NULL,
    request_body TEXT NOT NULL,
    post_revision INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE merge_undo_operations (
    id TEXT PRIMARY KEY,
    merge_id TEXT NOT NULL UNIQUE REFERENCES merge_operations(id),
    request_body TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE identity_decision_events (
    id TEXT PRIMARY KEY,
    request_body TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE identity_receipts (
    action TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    PRIMARY KEY(action, idempotency_key)
);
CREATE TRIGGER entity_redirects_flat_insert BEFORE INSERT ON entity_redirects
WHEN EXISTS(SELECT 1 FROM entity_redirects WHERE member_id = NEW.canonical_id OR canonical_id = NEW.member_id)
BEGIN SELECT RAISE(ABORT, 'identity redirects must remain flat'); END;
CREATE TRIGGER entity_redirects_flat_update BEFORE UPDATE ON entity_redirects
WHEN EXISTS(SELECT 1 FROM entity_redirects WHERE member_id = NEW.canonical_id)
BEGIN SELECT RAISE(ABORT, 'identity redirects must remain flat'); END;
CREATE TRIGGER entities_retired_write BEFORE UPDATE ON entities
WHEN EXISTS(SELECT 1 FROM entity_redirects WHERE member_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'retired entity is not writable'); END;
CREATE TRIGGER entities_merged_type BEFORE UPDATE OF type ON entities
WHEN OLD.type <> NEW.type AND EXISTS(SELECT 1 FROM entity_redirects WHERE member_id = OLD.id OR canonical_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'merged entity type is immutable'); END;
CREATE TRIGGER entities_merged_delete BEFORE DELETE ON entities
WHEN EXISTS(SELECT 1 FROM entity_redirects WHERE member_id = OLD.id OR canonical_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'merged entity cannot be deleted'); END;
CREATE TRIGGER entities_identity_revision_insert AFTER INSERT ON entities
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER entities_identity_revision_update AFTER UPDATE ON entities
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER entities_identity_revision_delete AFTER DELETE ON entities
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER entity_addresses_identity_revision_insert AFTER INSERT ON entity_addresses
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER entity_addresses_identity_revision_update AFTER UPDATE ON entity_addresses
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER entity_addresses_identity_revision_delete AFTER DELETE ON entity_addresses
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER person_profiles_identity_revision_insert AFTER INSERT ON person_profiles
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER person_profiles_identity_revision_update AFTER UPDATE ON person_profiles
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER person_profiles_identity_revision_delete AFTER DELETE ON person_profiles
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_records_identity_revision_insert AFTER INSERT ON source_records
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_records_identity_revision_update AFTER UPDATE ON source_records
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_records_identity_revision_delete AFTER DELETE ON source_records
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_record_history_identity_revision_insert AFTER INSERT ON source_record_history
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_record_history_identity_revision_update AFTER UPDATE ON source_record_history
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_record_history_identity_revision_delete AFTER DELETE ON source_record_history
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER contact_points_identity_revision_insert AFTER INSERT ON contact_points
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER contact_points_identity_revision_update AFTER UPDATE ON contact_points
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER contact_points_identity_revision_delete AFTER DELETE ON contact_points
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_accounts_identity_revision_insert AFTER INSERT ON source_accounts
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_accounts_identity_revision_update AFTER UPDATE ON source_accounts
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER source_accounts_identity_revision_delete AFTER DELETE ON source_accounts
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER blobs_identity_revision_insert AFTER INSERT ON blobs
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER blobs_identity_revision_update AFTER UPDATE ON blobs
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER blobs_identity_revision_delete AFTER DELETE ON blobs
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER entity_redirects_identity_revision_insert AFTER INSERT ON entity_redirects
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER entity_redirects_identity_revision_update AFTER UPDATE ON entity_redirects
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER entity_redirects_identity_revision_delete AFTER DELETE ON entity_redirects
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER merge_selections_identity_revision_insert AFTER INSERT ON merge_selections
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER merge_selections_identity_revision_update AFTER UPDATE ON merge_selections
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER merge_selections_identity_revision_delete AFTER DELETE ON merge_selections
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER keep_separate_identity_revision_insert AFTER INSERT ON keep_separate
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER keep_separate_identity_revision_update AFTER UPDATE ON keep_separate
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER keep_separate_identity_revision_delete AFTER DELETE ON keep_separate
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;
CREATE TRIGGER merge_operations_immutable_update BEFORE UPDATE ON merge_operations
BEGIN SELECT RAISE(ABORT, 'identity audit is immutable'); END;
CREATE TRIGGER merge_operations_immutable_delete BEFORE DELETE ON merge_operations
BEGIN SELECT RAISE(ABORT, 'identity audit is immutable'); END;
CREATE TRIGGER merge_undo_operations_immutable_update BEFORE UPDATE ON merge_undo_operations
BEGIN SELECT RAISE(ABORT, 'identity audit is immutable'); END;
CREATE TRIGGER merge_undo_operations_immutable_delete BEFORE DELETE ON merge_undo_operations
BEGIN SELECT RAISE(ABORT, 'identity audit is immutable'); END;
CREATE TRIGGER identity_decision_events_immutable_update BEFORE UPDATE ON identity_decision_events
BEGIN SELECT RAISE(ABORT, 'identity audit is immutable'); END;
CREATE TRIGGER identity_decision_events_immutable_delete BEFORE DELETE ON identity_decision_events
BEGIN SELECT RAISE(ABORT, 'identity audit is immutable'); END;
CREATE TRIGGER identity_receipts_immutable_update BEFORE UPDATE ON identity_receipts
BEGIN SELECT RAISE(ABORT, 'identity audit is immutable'); END;
CREATE TRIGGER identity_receipts_immutable_delete BEFORE DELETE ON identity_receipts
BEGIN SELECT RAISE(ABORT, 'identity audit is immutable'); END;
CREATE TRIGGER person_profiles_retired_insert BEFORE INSERT ON person_profiles
WHEN EXISTS(SELECT 1 FROM entity_redirects WHERE member_id=NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'retired entity is not writable'); END;
CREATE TRIGGER person_profiles_retired_update BEFORE UPDATE ON person_profiles
WHEN EXISTS(SELECT 1 FROM entity_redirects WHERE member_id=NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'retired entity is not writable'); END;
CREATE TRIGGER entity_addresses_retired_insert BEFORE INSERT ON entity_addresses
WHEN EXISTS(SELECT 1 FROM entity_redirects WHERE member_id=NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'retired entity is not writable'); END;
CREATE TRIGGER entity_addresses_retired_update BEFORE UPDATE ON entity_addresses
WHEN EXISTS(SELECT 1 FROM entity_redirects WHERE member_id=NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'retired entity is not writable'); END;
CREATE TRIGGER contact_points_retired_local_insert BEFORE INSERT ON contact_points
WHEN NEW.source_record_id IS NULL AND EXISTS(SELECT 1 FROM entity_redirects WHERE member_id=NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'retired entity is not writable'); END;
CREATE TRIGGER contact_points_retired_preference BEFORE UPDATE OF preferred ON contact_points
WHEN NEW.preferred <> OLD.preferred AND EXISTS(SELECT 1 FROM entity_redirects WHERE member_id=NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'retired entity is not writable'); END;
CREATE TRIGGER entities_clear_name_selection AFTER UPDATE OF name ON entities
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.id AND field='name'; END;
CREATE TRIGGER entities_clear_abn_selection AFTER UPDATE OF abn ON entities
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.id AND field='abn'; END;
CREATE TRIGGER entities_clear_aliases_selection AFTER UPDATE OF aliases ON entities
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.id AND field='aliases'; END;
CREATE TRIGGER entities_clear_default_transaction_type_selection AFTER UPDATE OF default_transaction_type ON entities
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.id AND field='defaultTransactionType'; END;
CREATE TRIGGER entities_clear_default_tags_selection AFTER UPDATE OF default_tags ON entities
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.id AND field='defaultTags'; END;
CREATE TRIGGER entities_clear_notes_selection AFTER UPDATE OF notes ON entities
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.id AND field='notes'; END;
CREATE TRIGGER entities_clear_avatar_asset_id_selection AFTER UPDATE OF avatar_asset_id ON entities
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.id AND field='avatarAssetId'; END;
CREATE TRIGGER entities_clear_poster_asset_id_selection AFTER UPDATE OF poster_asset_id ON entities
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.id AND field='posterAssetId'; END;
CREATE TRIGGER profile_clear_selection_insert AFTER INSERT ON person_profiles
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.entity_id AND field='personProfile'; END;
CREATE TRIGGER profile_clear_selection_update AFTER UPDATE ON person_profiles
BEGIN DELETE FROM merge_selections WHERE canonical_id=NEW.entity_id AND field='personProfile'; END;
CREATE TRIGGER entities_decision_delete BEFORE DELETE ON entities
WHEN EXISTS(SELECT 1 FROM keep_separate WHERE left_id=OLD.id OR right_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'identity decisions must be cleared before deletion'); END;
CREATE TRIGGER source_record_history_immutable_update BEFORE UPDATE ON source_record_history
BEGIN SELECT RAISE(ABORT, 'source observation is immutable'); END;
CREATE VIEW entity_identity_lookup AS
SELECT e.id,
       CASE WHEN selected_name.source_history_id IS NOT NULL THEN json_extract(history.observation,'$.displayName')
            WHEN selected_name.owner_entity_id IS NOT NULL THEN chosen_name.name
            ELSE e.name END AS name,
       e.type,
       CASE WHEN selected_aliases.owner_entity_id IS NOT NULL THEN chosen_aliases.aliases ELSE e.aliases END AS aliases
FROM entities e
LEFT JOIN merge_selections selected_name ON selected_name.canonical_id=e.id AND selected_name.field='name'
LEFT JOIN entities chosen_name ON chosen_name.id=selected_name.owner_entity_id
LEFT JOIN source_record_history history ON history.id=selected_name.source_history_id
LEFT JOIN merge_selections selected_aliases ON selected_aliases.canonical_id=e.id AND selected_aliases.field='aliases'
LEFT JOIN entities chosen_aliases ON chosen_aliases.id=selected_aliases.owner_entity_id
WHERE NOT EXISTS(SELECT 1 FROM entity_redirects WHERE member_id=e.id);
