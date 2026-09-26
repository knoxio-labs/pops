import GRDB

extension ReplicaSchema {
    /// Field default values: `catalogue_field.default_values` is a
    /// JSON array holding each default as `value_json` holds an item's value,
    /// `[]` when the field has none. Every row stored before this column reads
    /// `[]`.
    ///
    /// Like lineage, defaults a revision already carried on the server, but
    /// that an app predating this column stored without, may be filled in
    /// once when the revision is fetched again; defaults once recorded never
    /// change.
    static func registerCatalogueFieldDefaults(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v14_catalogue_field_defaults") { db in
            try db.execute(
                sql: """
                    ALTER TABLE catalogue_field
                    ADD COLUMN default_values TEXT NOT NULL DEFAULT '[]'
                    CHECK (json_valid(default_values) AND json_type(default_values) = 'array');
                    CREATE TRIGGER catalogue_field_defaults_once
                    BEFORE UPDATE OF default_values ON catalogue_field
                    WHEN OLD.default_values != '[]' BEGIN
                        SELECT RAISE(ABORT, 'catalogue is immutable');
                    END;
                    """)
        }
    }
}
