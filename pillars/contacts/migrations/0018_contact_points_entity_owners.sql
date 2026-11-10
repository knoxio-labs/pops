DROP TRIGGER contact_points_person_insert;
DROP TRIGGER contact_points_person_update;

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
