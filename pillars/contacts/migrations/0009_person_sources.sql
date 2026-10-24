CREATE TABLE source_accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    account_key TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(provider, account_key)
);
CREATE TABLE person_profiles (
    entity_id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    given_name TEXT,
    additional_names TEXT,
    family_name TEXT,
    name_prefix TEXT,
    name_suffix TEXT,
    name_completeness TEXT NOT NULL DEFAULT 'unknown'
        CHECK(name_completeness IN ('unknown', 'complete', 'incomplete')),
    updated_at TEXT NOT NULL
);
CREATE TABLE source_records (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES source_accounts(id),
    collection_key TEXT NOT NULL,
    record_key TEXT NOT NULL,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    display_name TEXT,
    given_name TEXT,
    additional_names TEXT,
    family_name TEXT,
    name_prefix TEXT,
    name_suffix TEXT,
    name_completeness TEXT NOT NULL DEFAULT 'unknown'
        CHECK(name_completeness IN ('unknown', 'complete', 'incomplete')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    last_seen_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
    UNIQUE(account_id, collection_key, record_key)
);
CREATE INDEX idx_source_records_entity ON source_records(entity_id);
CREATE TABLE contact_points (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('email', 'phone', 'social', 'url')),
    value TEXT NOT NULL,
    normalized_value TEXT,
    label TEXT,
    source_record_id TEXT REFERENCES source_records(id),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    preferred INTEGER NOT NULL DEFAULT 0 CHECK(preferred IN (0, 1)),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_contact_points_entity ON contact_points(entity_id);
CREATE INDEX idx_contact_points_source ON contact_points(source_record_id);
CREATE UNIQUE INDEX idx_contact_points_preferred ON contact_points(entity_id, kind)
    WHERE preferred = 1;
CREATE TRIGGER person_profiles_person_insert BEFORE INSERT ON person_profiles
WHEN NOT EXISTS(SELECT 1 FROM entities WHERE id = NEW.entity_id AND type = 'person')
BEGIN SELECT RAISE(ABORT, 'person profile requires person entity'); END;
CREATE TRIGGER source_records_person_insert BEFORE INSERT ON source_records
WHEN NOT EXISTS(SELECT 1 FROM entities WHERE id = NEW.entity_id AND type = 'person')
BEGIN SELECT RAISE(ABORT, 'source record requires person entity'); END;
CREATE TRIGGER contact_points_person_insert BEFORE INSERT ON contact_points
WHEN NOT EXISTS(SELECT 1 FROM entities WHERE id = NEW.entity_id AND type = 'person')
BEGIN SELECT RAISE(ABORT, 'contact point requires person entity'); END;
CREATE TRIGGER contact_points_source_owner_insert BEFORE INSERT ON contact_points
WHEN NEW.source_record_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM source_records WHERE id = NEW.source_record_id AND entity_id = NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'contact point source belongs to another person'); END;
CREATE TABLE source_record_history (
    id TEXT PRIMARY KEY,
    source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
    observed_at TEXT NOT NULL,
    observation TEXT NOT NULL
);
CREATE INDEX idx_source_record_history_record ON source_record_history(source_record_id);

CREATE TRIGGER entities_person_type_update BEFORE UPDATE OF type ON entities
WHEN OLD.type = 'person' AND NEW.type <> 'person' AND (
    EXISTS(SELECT 1 FROM person_profiles WHERE entity_id=OLD.id) OR
    EXISTS(SELECT 1 FROM source_records WHERE entity_id=OLD.id) OR
    EXISTS(SELECT 1 FROM contact_points WHERE entity_id=OLD.id))
BEGIN SELECT RAISE(ABORT, 'person data must be removed before changing entity type'); END;
CREATE TRIGGER person_profiles_person_update BEFORE UPDATE OF entity_id ON person_profiles
WHEN NOT EXISTS(SELECT 1 FROM entities WHERE id = NEW.entity_id AND type = 'person')
BEGIN SELECT RAISE(ABORT, 'person profile requires person entity'); END;
CREATE TRIGGER source_records_person_update BEFORE UPDATE OF entity_id ON source_records
WHEN NOT EXISTS(SELECT 1 FROM entities WHERE id = NEW.entity_id AND type = 'person')
BEGIN SELECT RAISE(ABORT, 'source record requires person entity'); END;
CREATE TRIGGER contact_points_person_update BEFORE UPDATE OF entity_id ON contact_points
WHEN NOT EXISTS(SELECT 1 FROM entities WHERE id = NEW.entity_id AND type = 'person')
BEGIN SELECT RAISE(ABORT, 'contact point requires person entity'); END;
CREATE TRIGGER contact_points_source_owner_update BEFORE UPDATE OF entity_id,source_record_id ON contact_points
WHEN NEW.source_record_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM source_records WHERE id = NEW.source_record_id AND entity_id = NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'contact point source belongs to another person'); END;
