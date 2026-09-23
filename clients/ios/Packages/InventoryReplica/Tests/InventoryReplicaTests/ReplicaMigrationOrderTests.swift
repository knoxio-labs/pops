import GRDB
import Testing

@testable import InventoryReplica

@Suite("Replica migration order")
struct ReplicaMigrationOrderTests {
    @Test("a fresh replica applies the local computed values before the catalogue update hold")
    func freshReplicaAppliesBoth() throws {
        let queue = try DatabaseQueue()
        let migrator = ReplicaSchema.migrator()

        try migrator.migrate(queue)

        try queue.read { db in
            let applied = try migrator.appliedMigrations(db)
            #expect(Array(applied.suffix(3)) == [
                "v8_computed_values", "v9_local_computed_values", "v10_catalogue_update_hold",
            ])
            #expect(try db.tableExists(ComputedValueRows.localTableName))
            #expect(try Self.mutationLogColumns(db).contains("awaiting_catalogue_after"))
        }
    }

    @Test("upgrading a replica with a pending change keeps it and leaves it not held")
    func upgradeKeepsPendingChanges() throws {
        let queue = try DatabaseQueue()
        try ReplicaSchema.migrator().migrate(queue, upTo: "v8_computed_values")
        try queue.write { db in
            #expect(try !db.tableExists(ComputedValueRows.localTableName))
            #expect(try !Self.mutationLogColumns(db).contains("awaiting_catalogue_after"))
            try db.execute(
                sql: """
                    INSERT INTO mutation_log (mutation_id, entity_kind, entity_id, command,
                        depends_on, state, touched, created_at)
                    VALUES ('m-1', 'item', 'item-1', '{}', '[]', 'queued', '[]', 0)
                    """)
        }

        try ReplicaSchema.migrator().migrate(queue)

        try queue.read { db in
            let row = try Row.fetchOne(
                db,
                sql: """
                    SELECT state, catalogue_revision, awaiting_catalogue_after
                    FROM mutation_log WHERE mutation_id = 'm-1'
                    """)
            let state: String? = row?["state"]
            let revision: Int? = row?["catalogue_revision"]
            let heldAfter: Int? = row?["awaiting_catalogue_after"]
            #expect(state == "queued")
            #expect(revision == 1)
            #expect(heldAfter == nil)
            #expect(
                try Int.fetchOne(
                    db, sql: "SELECT count(*) FROM \(ComputedValueRows.localTableName)") == 0)
        }
    }

    private static func mutationLogColumns(_ db: Database) throws -> Set<String> {
        Set(try db.columns(in: "mutation_log").map(\.name))
    }
}
