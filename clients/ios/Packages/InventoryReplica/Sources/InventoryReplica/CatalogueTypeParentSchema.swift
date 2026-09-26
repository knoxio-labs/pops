import GRDB

extension ReplicaSchema {
    static func registerCatalogueTypeParent(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v15_catalogue_type_parent") { db in
            try db.execute(
                sql:
                    "ALTER TABLE catalogue_type ADD COLUMN parent_id TEXT CHECK (parent_id IS NULL OR parent_id <> id)"
            )
            try db.execute(sql: "DROP TRIGGER catalogue_type_no_update")
            let columns = (typeColumns + ["parent_id"]).joined(separator: ", ")
            try db.execute(
                sql: """
                    CREATE TRIGGER catalogue_type_no_update
                    BEFORE UPDATE OF \(columns) ON catalogue_type BEGIN
                        SELECT RAISE(ABORT, 'catalogue is immutable');
                    END;
                    """
            )
        }
    }
}
