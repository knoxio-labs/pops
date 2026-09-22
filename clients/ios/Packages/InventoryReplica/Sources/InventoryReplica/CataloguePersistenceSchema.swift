import GRDB

extension ReplicaSchema {
    static let catalogueTables = [
        "catalogue_revision", "catalogue_type", "catalogue_field", "catalogue_option",
    ]

    static let fieldValueLayers = ["item_field_value_base", "item_field_value"]

    static func registerCataloguePersistence(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v7_catalogue_persistence") { db in
            try addRevisionPins(db)
            try db.execute(sql: catalogueTablesSQL)
            try db.execute(sql: fieldValueTablesSQL)
            try db.execute(sql: catalogueImmutabilitySQL)
        }
    }

    private static func addRevisionPins(_ db: Database) throws {
        try db.execute(
            sql: "ALTER TABLE mutation_log ADD COLUMN catalogue_revision INTEGER NOT NULL DEFAULT 1"
        )
        try db.execute(sql: "ALTER TABLE sync_meta ADD COLUMN catalogue_revision INTEGER")
        for table in itemLayers {
            try db.execute(sql: "ALTER TABLE \(table) ADD COLUMN catalogue_revision INTEGER")
            try db.execute(sql: "ALTER TABLE \(table) ADD COLUMN type_id TEXT")
        }
    }

    private static let catalogueTablesSQL = """
        CREATE TABLE catalogue_revision (
            revision INTEGER PRIMARY KEY NOT NULL,
            base_revision INTEGER,
            status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'abandoned')),
            minimum_protocol INTEGER NOT NULL CHECK (minimum_protocol > 0)
        );
        CREATE TABLE catalogue_type (
            revision INTEGER NOT NULL,
            id TEXT NOT NULL,
            key TEXT NOT NULL,
            label TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
            capabilities TEXT NOT NULL CHECK (json_valid(capabilities)),
            legacy_labels TEXT NOT NULL CHECK (json_valid(legacy_labels)),
            presentation TEXT NOT NULL CHECK (json_valid(presentation)),
            archived_at TEXT,
            PRIMARY KEY (revision, id),
            UNIQUE (revision, key),
            FOREIGN KEY (revision) REFERENCES catalogue_revision(revision)
        );
        CREATE TABLE catalogue_field (
            revision INTEGER NOT NULL,
            id TEXT NOT NULL,
            type_id TEXT NOT NULL,
            key TEXT NOT NULL,
            label TEXT NOT NULL,
            help TEXT,
            sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
            kind TEXT NOT NULL,
            cardinality TEXT NOT NULL CHECK (cardinality IN ('one', 'many')),
            required INTEGER NOT NULL,
            storage TEXT NOT NULL CHECK (storage IN ('stored', 'computed')),
            fixed_unit TEXT,
            reference_kinds TEXT NOT NULL CHECK (json_valid(reference_kinds)),
            reference_type_ids TEXT NOT NULL CHECK (json_valid(reference_type_ids)),
            expression_version INTEGER,
            expression TEXT CHECK (expression IS NULL OR json_valid(expression)),
            allow_override INTEGER NOT NULL,
            presentation TEXT NOT NULL CHECK (json_valid(presentation)),
            archived_at TEXT,
            PRIMARY KEY (revision, id),
            UNIQUE (revision, type_id, key),
            FOREIGN KEY (revision, type_id) REFERENCES catalogue_type(revision, id)
        );
        CREATE TABLE catalogue_option (
            revision INTEGER NOT NULL,
            id TEXT NOT NULL,
            field_id TEXT NOT NULL,
            key TEXT NOT NULL,
            label TEXT NOT NULL,
            sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
            archived_at TEXT,
            PRIMARY KEY (revision, id),
            UNIQUE (revision, field_id, key),
            FOREIGN KEY (revision, field_id) REFERENCES catalogue_field(revision, id)
        );
        """

    private static let fieldValueTablesSQL = """
        CREATE TABLE item_field_value_base (
            item_id TEXT NOT NULL,
            field_id TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('stored', 'override')),
            ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
            catalogue_revision INTEGER NOT NULL,
            value_json TEXT NOT NULL CHECK (json_valid(value_json)),
            PRIMARY KEY (item_id, field_id, source, ordinal),
            FOREIGN KEY (catalogue_revision, field_id)
                REFERENCES catalogue_field(revision, id)
        );
        CREATE TABLE item_field_value (
            item_id TEXT NOT NULL,
            field_id TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('stored', 'override')),
            ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
            catalogue_revision INTEGER NOT NULL,
            value_json TEXT NOT NULL CHECK (json_valid(value_json)),
            PRIMARY KEY (item_id, field_id, source, ordinal),
            FOREIGN KEY (catalogue_revision, field_id)
                REFERENCES catalogue_field(revision, id)
        );
        CREATE INDEX item_field_value_revision
            ON item_field_value(catalogue_revision, field_id);
        CREATE INDEX item_field_value_base_revision
            ON item_field_value_base(catalogue_revision, field_id);
        """

    private static let catalogueImmutabilitySQL = """
        CREATE TRIGGER catalogue_revision_no_update
        BEFORE UPDATE ON catalogue_revision BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        CREATE TRIGGER catalogue_revision_no_delete
        BEFORE DELETE ON catalogue_revision BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        CREATE TRIGGER catalogue_type_no_update
        BEFORE UPDATE ON catalogue_type BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        CREATE TRIGGER catalogue_type_no_delete
        BEFORE DELETE ON catalogue_type BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        CREATE TRIGGER catalogue_field_no_update
        BEFORE UPDATE ON catalogue_field BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        CREATE TRIGGER catalogue_field_no_delete
        BEFORE DELETE ON catalogue_field BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        CREATE TRIGGER catalogue_option_no_update
        BEFORE UPDATE ON catalogue_option BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        CREATE TRIGGER catalogue_option_no_delete
        BEFORE DELETE ON catalogue_option BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        """
}
