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
        migrator.registerMigration("v10_catalogue_update_hold") { db in
            try db.execute(
                sql:
                    "ALTER TABLE \(mutationLogTableName) ADD COLUMN awaiting_catalogue_after INTEGER"
            )
        }
    }

    /// `mutation_log.catalogue_revision` becomes nullable (POPS-4492):
    /// `v7_catalogue_persistence` added it `NOT NULL DEFAULT 1`, so "no
    /// revision" was stored as revision 1. SQLite cannot drop `NOT NULL` in
    /// place, so the table is rebuilt with every row, and the
    /// `AUTOINCREMENT` counter carried over so no `local_seq` is reused.
    ///
    /// A stored revision is kept where it can be real and cleared where it
    /// cannot (`InventoryCommand.sentCatalogueRevision(active:)` decides
    /// what a command carries):
    /// - a protocol-2 command's row keeps it: the command was authored
    ///   against it, and carries it too;
    /// - an override's or a split's keeps it, unless it is 1 and this phone
    ///   holds no revision 1, which only the old fallback wrote;
    /// - every other command's row, and an Undo's, is cleared: those are
    ///   sent with no revision, and a 1 there was the default or the
    ///   fallback, not a revision anyone authored against.
    static func registerNullableCatalogueRevision(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v11_nullable_catalogue_revision") { db in
            let table = mutationLogTableName
            let counter = try Int64.fetchOne(
                db, sql: "SELECT seq FROM sqlite_sequence WHERE name = ?", arguments: [table])
            try db.execute(sql: mutationLogV11Table("\(table)_v11"))
            try db.execute(
                sql: """
                    INSERT INTO \(table)_v11 (\(mutationLogV11Columns), catalogue_revision)
                    SELECT \(mutationLogV11Columns), \(keptCatalogueRevision) FROM \(table);
                    DROP TABLE \(table);
                    ALTER TABLE \(table)_v11 RENAME TO \(table);
                    CREATE INDEX mutation_log_state ON \(table)(state);
                    CREATE INDEX mutation_log_outcome_seq ON \(table)(outcome_seq);
                    """)
            if let counter {
                try db.execute(
                    sql: """
                        INSERT INTO sqlite_sequence (name, seq) SELECT ?, ?
                        WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = ?)
                        """, arguments: [table, counter, table])
                try db.execute(
                    sql: "UPDATE sqlite_sequence SET seq = max(seq, ?) WHERE name = ?",
                    arguments: [counter, table])
            }
        }
    }

    private static let mutationLogV11Columns = """
        local_seq, mutation_id, entity_kind, entity_id, command, depends_on, base_revision, state,
        outcome, outcome_seq, settles_at_seq, touched, change, attempts, created_at,
        last_attempt_at, awaiting_catalogue_after
        """

    private static func commandIs(_ cases: [String]) -> String {
        let tests = cases.map { "json_type(command, '$.\($0)') IS NOT NULL" }
        return "(json_valid(command) AND (\(tests.joined(separator: " OR "))))"
    }

    private static let keptCatalogueRevision = """
        CASE
            WHEN \(commandIs(["createProtocol2Item", "editProtocol2Item", "changeProtocol2ItemType"]))
                THEN catalogue_revision
            WHEN \(commandIs(["setComputedOverride", "clearComputedOverride", "splitItem"]))
                AND (catalogue_revision <> 1
                    OR EXISTS (SELECT 1 FROM catalogue_revision WHERE revision = 1))
                THEN catalogue_revision
            ELSE NULL
        END
        """

    private static func mutationLogV11Table(_ name: String) -> String {
        """
        CREATE TABLE \(name) (
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
            last_attempt_at REAL,
            catalogue_revision INTEGER,
            awaiting_catalogue_after INTEGER
        )
        """
    }
}
