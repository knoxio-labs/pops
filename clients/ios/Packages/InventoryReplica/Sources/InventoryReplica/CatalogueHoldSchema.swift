import GRDB

extension ReplicaSchema {
    /// Why a change waits on the catalogue, and what the server said about
    /// it, so the Sync ledger can say so after a relaunch (POPS-4494):
    ///
    /// - `mutation_log.catalogue_hold`: `new_fields` while the change waits
    ///   for a newer catalogue this phone can fetch, `app_update` while that
    ///   catalogue needs a newer app. Null for a change that is not held,
    ///   and set exactly when `awaiting_catalogue_after` is: a row held
    ///   before this column existed is backfilled `new_fields`.
    /// - `mutation_log.catalogue_changes`: the server's
    ///   ``StoredCatalogueChange``s for the refusal that held it, as JSON,
    ///   whose replacements the move onto the newer catalogue tries first.
    static func registerCatalogueHoldReason(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v12_catalogue_hold_reason") { db in
            try db.execute(
                sql: """
                    ALTER TABLE \(mutationLogTableName) ADD COLUMN catalogue_hold TEXT
                        CHECK (catalogue_hold IN ('new_fields', 'app_update'));
                    ALTER TABLE \(mutationLogTableName) ADD COLUMN catalogue_changes TEXT;
                    UPDATE \(mutationLogTableName) SET catalogue_hold = 'new_fields'
                        WHERE awaiting_catalogue_after IS NOT NULL;
                    """)
        }
    }
}
