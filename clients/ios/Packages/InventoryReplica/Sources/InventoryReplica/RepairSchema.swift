import GRDB

extension ReplicaSchema {
    static let repairTableName = "repair"
    static let resolvedEntryTableName = "resolved_entry"

    /// The repairs a conflicted or rejected outcome opens, and what the Sync
    /// page lists as resolved (ADR-002's iOS replica design).
    ///
    /// - `repair`: one row per mutation the server would not take, keyed by
    ///   its mutation id, which stays in `mutation_log` in that state while
    ///   the repair is open. `kind` is the outcome's (`field`,
    ///   `code_collision`, `deleted`, `photo_failed`, `catalogue_changed`,
    ///   `rejected`); `payload`
    ///   is the outcome whole, with the change's own side of it. A resolved
    ///   row keeps `resolution`, and `reissued_as` with
    ///   `base_revision_floor` when keeping this phone's side sent the change
    ///   again under a new mutation id.
    /// - `resolved_entry`: one row per settled repair or converged outcome,
    ///   with the line the Sync page shows for it.
    static func registerRepairs(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v4_repairs") { db in
            try db.execute(
                sql: """
                    CREATE TABLE \(repairTableName) (
                        mutation_id TEXT PRIMARY KEY NOT NULL,
                        entity_kind TEXT NOT NULL CHECK (entity_kind IN ('item', 'location')),
                        entity_id TEXT NOT NULL,
                        kind TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        opened_at REAL NOT NULL,
                        resolved_at REAL,
                        resolution TEXT,
                        reissued_as TEXT,
                        base_revision_floor INTEGER
                    );
                    CREATE INDEX repair_resolved_at ON \(repairTableName)(resolved_at);
                    CREATE INDEX repair_reissued_as ON \(repairTableName)(reissued_as);
                    CREATE TABLE \(resolvedEntryTableName) (
                        id TEXT PRIMARY KEY NOT NULL,
                        entity_id TEXT NOT NULL,
                        outcome TEXT NOT NULL,
                        resolved_at REAL NOT NULL
                    );
                    CREATE INDEX resolved_entry_resolved_at
                        ON \(resolvedEntryTableName)(resolved_at);
                    """)
        }
    }
}
