import GRDB

extension ReplicaSchema {
    /// Replacement lineage on stored catalogue definitions (POPS-4494
    /// decision 3): `catalogue_type.replaced_by` and
    /// `catalogue_field.replaced_by` name the live definition that took over
    /// an archived one, null when none is recorded.
    ///
    /// A revision stays immutable, with one exception: lineage a revision
    /// already carried on the server, but that an app predating this column
    /// stored without, may be filled in once when the revision is fetched
    /// again. Every other column still refuses an update, and lineage once
    /// recorded never changes.
    static func registerCatalogueLineage(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v13_catalogue_lineage") { db in
            for table in ["catalogue_type", "catalogue_field"] {
                try db.execute(sql: "ALTER TABLE \(table) ADD COLUMN replaced_by TEXT")
                try db.execute(sql: "DROP TRIGGER \(table)_no_update")
            }
            try db.execute(sql: lineageTriggers("catalogue_type", columns: typeColumns))
            try db.execute(sql: lineageTriggers("catalogue_field", columns: fieldColumns))
        }
    }

    static let typeColumns = [
        "revision", "id", "key", "label", "description", "sort_order", "capabilities",
        "legacy_labels", "presentation", "archived_at",
    ]

    private static let fieldColumns = [
        "revision", "id", "type_id", "key", "label", "help", "sort_order", "kind", "cardinality",
        "required", "storage", "fixed_unit", "reference_kinds", "reference_type_ids",
        "expression_version", "expression", "allow_override", "presentation", "archived_at",
    ]

    private static func lineageTriggers(_ table: String, columns: [String]) -> String {
        """
        CREATE TRIGGER \(table)_no_update
        BEFORE UPDATE OF \(columns.joined(separator: ", ")) ON \(table) BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        CREATE TRIGGER \(table)_lineage_once
        BEFORE UPDATE OF replaced_by ON \(table)
        WHEN OLD.replaced_by IS NOT NULL OR NEW.replaced_by IS NULL BEGIN
            SELECT RAISE(ABORT, 'catalogue is immutable');
        END;
        """
    }
}
