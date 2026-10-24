DROP INDEX idx_entities_name_unicode_nocase;
CREATE UNIQUE INDEX idx_entities_non_person_name_unicode_nocase
    ON entities (name COLLATE UNICODE_NOCASE) WHERE type <> 'person';
CREATE INDEX idx_entities_person_name ON entities (name COLLATE UNICODE_NOCASE)
    WHERE type = 'person';
