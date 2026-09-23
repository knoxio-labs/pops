import GRDB

extension ReplicaSchema {
    /// This phone's changes the server has not settled yet (ADR-002 D11),
    /// one row per mutation. `local_seq` is `AUTOINCREMENT`, so an id is
    /// never reused even after its row is cancelled, and it is the order the
    /// log replays and drains in.
    ///
    /// - `command`: the ``StoredCommand``; `depends_on`: mutation ids that
    ///   must apply first.
    /// - `base_revision`: the revision the server judges the change against,
    ///   null for the ops it judges itself.
    /// - `state`: queued (never attempted, or returned to the queue), sending
    ///   (in the drain's batch), applied, conflicted, rejected, or deferred
    ///   (the server is waiting on a dependency).
    /// - `outcome`, `outcome_seq`, `settles_at_seq`: the server's answer; an
    ///   applied change keeps replaying over the base until the feed has
    ///   caught up to the batch's high-water `seq`.
    /// - `touched`, `change`: which rows its last replay wrote, and what it
    ///   did to its own entity, for the next rebase and for Undo.
    static func registerMutationLog(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v3_mutation_log") { db in
            try db.execute(
                sql: """
                    CREATE TABLE \(mutationLogTableName) (
                        local_seq INTEGER PRIMARY KEY AUTOINCREMENT,
                        mutation_id TEXT NOT NULL UNIQUE,
                        entity_kind TEXT NOT NULL CHECK (entity_kind IN ('item', 'location')),
                        entity_id TEXT NOT NULL,
                        command TEXT NOT NULL,
                        depends_on TEXT NOT NULL,
                        base_revision INTEGER,
                        state TEXT NOT NULL CHECK (state IN (
                            'queued', 'sending', 'applied', 'conflicted', 'rejected', 'deferred')),
                        outcome TEXT,
                        outcome_seq INTEGER,
                        settles_at_seq INTEGER,
                        touched TEXT NOT NULL,
                        change TEXT,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        created_at REAL NOT NULL,
                        last_attempt_at REAL
                    );
                    CREATE INDEX mutation_log_state ON \(mutationLogTableName)(state);
                    CREATE INDEX mutation_log_outcome_seq ON \(mutationLogTableName)(outcome_seq);
                    """)
        }
    }
}

extension ReplicaSchema {
    /// `mutation_log.awaiting_catalogue_after`: the catalogue revision a
    /// change the server answered `catalogue_update_required` for waits to be
    /// moved past (``LogEntry/awaitingCatalogueAfter``). Null for every
    /// change that is not waiting on a catalogue.
    static func registerCatalogueUpdateHold(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v9_catalogue_update_hold") { db in
            try db.execute(
                sql:
                    "ALTER TABLE \(mutationLogTableName) ADD COLUMN awaiting_catalogue_after INTEGER"
            )
        }
    }
}
