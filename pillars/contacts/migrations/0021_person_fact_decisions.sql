CREATE TABLE person_fact_operations (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    undo_of TEXT UNIQUE REFERENCES person_fact_operations(id),
    created_at TEXT NOT NULL
);
CREATE TABLE person_fact_operation_evidence (
    operation_id TEXT PRIMARY KEY REFERENCES person_fact_operations(id),
    evidence TEXT NOT NULL
);
CREATE TRIGGER person_fact_evidence_immutable_update BEFORE UPDATE ON person_fact_operation_evidence
BEGIN SELECT RAISE(ABORT, 'fact audit is immutable'); END;
CREATE TRIGGER person_fact_evidence_immutable_delete BEFORE DELETE ON person_fact_operation_evidence
BEGIN SELECT RAISE(ABORT, 'fact audit is immutable'); END;
CREATE INDEX idx_person_fact_operations_entity ON person_fact_operations(entity_id, created_at);
CREATE TABLE person_fact_decisions (
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    operation_id TEXT NOT NULL REFERENCES person_fact_operations(id),
    value TEXT NOT NULL,
    PRIMARY KEY(entity_id, target)
);
CREATE TABLE person_fact_origins (
    kind TEXT NOT NULL CHECK(kind IN ('point','address')),
    id TEXT NOT NULL,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    PRIMARY KEY(kind,id)
);
CREATE TABLE person_fact_selection_versions (
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    field TEXT NOT NULL,
    version INTEGER NOT NULL,
    operation_id TEXT,
    PRIMARY KEY(entity_id,field)
);
CREATE TRIGGER person_fact_selection_insert AFTER INSERT ON merge_selections
BEGIN
    INSERT INTO person_fact_selection_versions VALUES(NEW.canonical_id,NEW.field,1,NULL)
    ON CONFLICT(entity_id,field) DO UPDATE SET version=version+1,operation_id=NULL;
END;
CREATE TRIGGER person_fact_selection_update AFTER UPDATE ON merge_selections
BEGIN
    INSERT INTO person_fact_selection_versions VALUES(NEW.canonical_id,NEW.field,1,NULL)
    ON CONFLICT(entity_id,field) DO UPDATE SET version=version+1,operation_id=NULL;
END;
CREATE TRIGGER person_fact_selection_delete AFTER DELETE ON merge_selections
BEGIN
    INSERT INTO person_fact_selection_versions SELECT OLD.canonical_id,OLD.field,1,NULL
    WHERE EXISTS(SELECT 1 FROM entities WHERE id=OLD.canonical_id)
    ON CONFLICT(entity_id,field) DO UPDATE SET version=version+1,operation_id=NULL;
END;
CREATE TRIGGER person_fact_decisions_revision_insert AFTER INSERT ON person_fact_decisions
BEGIN UPDATE contact_directory_revision SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER person_fact_decisions_revision_update AFTER UPDATE ON person_fact_decisions
BEGIN UPDATE contact_directory_revision SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER person_fact_decisions_revision_delete AFTER DELETE ON person_fact_decisions
BEGIN UPDATE contact_directory_revision SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER person_fact_operations_immutable_update BEFORE UPDATE ON person_fact_operations
BEGIN SELECT RAISE(ABORT, 'fact audit is immutable'); END;
CREATE TRIGGER person_fact_operations_immutable_delete BEFORE DELETE ON person_fact_operations
BEGIN SELECT RAISE(ABORT, 'fact audit is immutable'); END;
CREATE TRIGGER entities_clear_fact_name AFTER UPDATE OF name ON entities
BEGIN DELETE FROM person_fact_decisions WHERE entity_id=NEW.id AND target='entity:name'; END;
CREATE TRIGGER entities_clear_fact_notes AFTER UPDATE OF notes ON entities
BEGIN DELETE FROM person_fact_decisions WHERE entity_id=NEW.id AND target='entity:notes'; END;
DROP VIEW entity_identity_lookup;
CREATE VIEW entity_identity_lookup AS
SELECT e.id,
       CASE WHEN local_details.value IS NOT NULL THEN json_extract(local_details.value,'$.name')
            WHEN selected_name.source_history_id IS NOT NULL THEN json_extract(history.observation,'$.displayName')
            WHEN chosen_details.value IS NOT NULL THEN json_extract(chosen_details.value,'$.name')
            WHEN selected_name.owner_entity_id IS NOT NULL THEN chosen_name.name
            ELSE e.name END AS name,
       e.type,
       CASE WHEN selected_aliases.owner_entity_id IS NOT NULL THEN chosen_aliases.aliases ELSE e.aliases END AS aliases
FROM entities e
LEFT JOIN person_fact_decisions local_details ON local_details.entity_id=e.id AND local_details.target='entity:name'
LEFT JOIN merge_selections selected_name ON selected_name.canonical_id=e.id AND selected_name.field='name'
LEFT JOIN entities chosen_name ON chosen_name.id=selected_name.owner_entity_id
LEFT JOIN person_fact_decisions chosen_details ON chosen_details.entity_id=chosen_name.id AND chosen_details.target='entity:name'
LEFT JOIN source_record_history history ON history.id=selected_name.source_history_id
LEFT JOIN merge_selections selected_aliases ON selected_aliases.canonical_id=e.id AND selected_aliases.field='aliases'
LEFT JOIN entities chosen_aliases ON chosen_aliases.id=selected_aliases.owner_entity_id
WHERE NOT EXISTS(SELECT 1 FROM entity_redirects WHERE member_id=e.id);
CREATE TRIGGER entity_addresses_clear_fact_override AFTER UPDATE ON entity_addresses
BEGIN
    DELETE FROM person_fact_decisions WHERE target='address:' || NEW.id;
    DELETE FROM person_fact_origins WHERE kind='address' AND id=NEW.id;
END;
CREATE TRIGGER merge_selection_clear_fact_details_insert AFTER INSERT ON merge_selections
WHEN NEW.field IN ('name','notes')
BEGIN DELETE FROM person_fact_decisions WHERE entity_id=NEW.canonical_id AND target='entity:' || NEW.field; END;
CREATE TRIGGER merge_selection_clear_fact_details_update AFTER UPDATE ON merge_selections
WHEN NEW.field IN ('name','notes')
BEGIN DELETE FROM person_fact_decisions WHERE entity_id=NEW.canonical_id AND target='entity:' || NEW.field; END;
CREATE TRIGGER merge_selection_clear_fact_details_delete AFTER DELETE ON merge_selections
WHEN OLD.field IN ('name','notes')
BEGIN DELETE FROM person_fact_decisions WHERE entity_id=OLD.canonical_id AND target='entity:' || OLD.field; END;
