DROP VIEW entity_identity_lookup;

DROP TRIGGER contact_points_source_owner_insert;

DROP TRIGGER entities_person_type_update;

DROP TRIGGER contact_points_source_owner_update;

DROP TRIGGER contact_points_identity_revision_insert;

DROP TRIGGER contact_points_identity_revision_update;

DROP TRIGGER contact_points_identity_revision_delete;

DROP TRIGGER merge_selections_identity_revision_insert;

DROP TRIGGER merge_selections_identity_revision_update;

DROP TRIGGER merge_selections_identity_revision_delete;

DROP TRIGGER contact_points_retired_local_insert;

DROP TRIGGER contact_points_retired_preference;

DROP TRIGGER entities_clear_name_selection;

DROP TRIGGER entities_clear_abn_selection;

DROP TRIGGER entities_clear_aliases_selection;

DROP TRIGGER entities_clear_default_transaction_type_selection;

DROP TRIGGER entities_clear_default_tags_selection;

DROP TRIGGER entities_clear_notes_selection;

DROP TRIGGER entities_clear_avatar_asset_id_selection;

DROP TRIGGER entities_clear_poster_asset_id_selection;

DROP TRIGGER profile_clear_selection_insert;

DROP TRIGGER profile_clear_selection_update;

DROP TRIGGER contact_points_owner_insert;

DROP TRIGGER contact_points_owner_update;

DROP TRIGGER entities_contact_points_owner_update;

CREATE TABLE contact_points_replacement (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('email', 'phone', 'social', 'url', 'other')),
    value TEXT NOT NULL,
    normalized_value TEXT,
    label TEXT,
    country_code TEXT,
    source_record_id TEXT REFERENCES source_records(id),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    preferred INTEGER NOT NULL DEFAULT 0 CHECK(preferred IN (0, 1)),
    created_at TEXT NOT NULL
);

INSERT INTO contact_points_replacement SELECT * FROM contact_points;

CREATE TABLE merge_selections_replacement (
    canonical_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    field TEXT NOT NULL,
    owner_entity_id TEXT REFERENCES entities(id),
    point_id TEXT REFERENCES contact_points_replacement(id) ON DELETE CASCADE,
    source_history_id TEXT REFERENCES source_record_history(id),
    PRIMARY KEY(canonical_id, field),
    CHECK((owner_entity_id IS NOT NULL) + (point_id IS NOT NULL) + (source_history_id IS NOT NULL) = 1)
);

INSERT INTO merge_selections_replacement SELECT * FROM merge_selections;

DROP TABLE merge_selections;

DROP TABLE contact_points;

ALTER TABLE contact_points_replacement RENAME TO contact_points;

ALTER TABLE merge_selections_replacement RENAME TO merge_selections;

CREATE INDEX idx_contact_points_entity ON contact_points(entity_id);

CREATE INDEX idx_contact_points_source ON contact_points(source_record_id);

CREATE UNIQUE INDEX idx_contact_points_preferred ON contact_points(entity_id, kind)
    WHERE preferred = 1;

CREATE TRIGGER contact_points_source_owner_insert BEFORE INSERT ON contact_points
WHEN NEW.source_record_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM source_records WHERE id = NEW.source_record_id AND entity_id = NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'contact point source belongs to another person'); END;

CREATE TRIGGER entities_person_type_update BEFORE UPDATE OF type ON entities
WHEN OLD.type = 'person' AND NEW.type <> 'person' AND (
    EXISTS(SELECT 1 FROM person_profiles WHERE entity_id=OLD.id) OR
    EXISTS(SELECT 1 FROM source_records WHERE entity_id=OLD.id) OR
    EXISTS(SELECT 1 FROM contact_points WHERE entity_id=OLD.id))
BEGIN SELECT RAISE(ABORT, 'person data must be removed before changing entity type'); END;

CREATE TRIGGER contact_points_source_owner_update BEFORE UPDATE OF entity_id,source_record_id ON contact_points
WHEN NEW.source_record_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM source_records WHERE id = NEW.source_record_id AND entity_id = NEW.entity_id)
BEGIN SELECT RAISE(ABORT, 'contact point source belongs to another person'); END;

CREATE TRIGGER contact_points_identity_revision_insert AFTER INSERT ON contact_points
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;

CREATE TRIGGER contact_points_identity_revision_update AFTER UPDATE ON contact_points
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;

CREATE TRIGGER contact_points_identity_revision_delete AFTER DELETE ON contact_points
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;

CREATE TRIGGER merge_selections_identity_revision_insert AFTER INSERT ON merge_selections
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;

CREATE TRIGGER merge_selections_identity_revision_update AFTER UPDATE ON merge_selections
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;

CREATE TRIGGER merge_selections_identity_revision_delete AFTER DELETE ON merge_selections
BEGIN UPDATE contact_directory_revision SET revision = revision + 1 WHERE singleton = 1; END;

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

CREATE TRIGGER contact_points_owner_insert BEFORE INSERT ON contact_points
WHEN NOT EXISTS(
    SELECT 1 FROM entities
    WHERE id = NEW.entity_id
      AND (type = 'person' OR
           (type IN ('company', 'organisation') AND NEW.source_record_id IS NULL))
)
BEGIN SELECT RAISE(ABORT, 'contact point requires an eligible entity'); END;

CREATE TRIGGER contact_points_owner_update BEFORE UPDATE OF entity_id,source_record_id ON contact_points
WHEN NOT EXISTS(
    SELECT 1 FROM entities
    WHERE id = NEW.entity_id
      AND (type = 'person' OR
           (type IN ('company', 'organisation') AND NEW.source_record_id IS NULL))
)
BEGIN SELECT RAISE(ABORT, 'contact point requires an eligible entity'); END;

CREATE TRIGGER entities_contact_points_owner_update BEFORE UPDATE OF type ON entities
WHEN NEW.type NOT IN ('person', 'company', 'organisation')
 AND EXISTS(
    SELECT 1 FROM contact_points
    WHERE entity_id = OLD.id AND source_record_id IS NULL
 )
BEGIN SELECT RAISE(ABORT, 'local contact points require an eligible entity'); END;

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
