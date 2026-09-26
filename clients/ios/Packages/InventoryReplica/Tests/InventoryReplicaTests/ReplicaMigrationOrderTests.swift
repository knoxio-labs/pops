import GRDB
import Testing

@testable import InventoryReplica

@Suite("Replica migration order")
internal struct ReplicaMigrationOrderTests {
    @Test(
        "a fresh replica applies every migration from computed values to field defaults, in order"
    )
    func freshReplicaAppliesBoth() throws {
        let queue = try DatabaseQueue()
        let migrator = ReplicaSchema.migrator()

        try migrator.migrate(queue)

        try queue.read { db in
            let applied = try migrator.appliedMigrations(db)
            let expected = [
                "v8_computed_values", "v9_local_computed_values", "v10_catalogue_update_hold",
                "v11_nullable_catalogue_revision", "v12_catalogue_hold_reason",
                "v13_catalogue_lineage", "v14_catalogue_field_defaults",
            ]
            #expect(Array(applied.suffix(7)) == expected)
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
            #expect(revision == nil)
            #expect(heldAfter == nil)
            #expect(
                try Int.fetchOne(
                    db, sql: "SELECT count(*) FROM \(ComputedValueRows.localTableName)") == 0)
        }
    }

    @Test("a fresh replica keeps why a change is held, and refuses a reason it does not know")
    func freshReplicaKeepsHoldReason() throws {
        let queue = try DatabaseQueue()
        try ReplicaSchema.migrator().migrate(queue)

        try queue.write { db in
            let columns = try Self.mutationLogColumns(db)
            #expect(columns.isSuperset(of: ["catalogue_hold", "catalogue_changes"]))
            try Self.insertQueued("m-1", heldAfter: nil, in: db)
            #expect(throws: DatabaseError.self) {
                try db.execute(
                    sql:
                        "UPDATE mutation_log SET catalogue_hold = 'someday' WHERE mutation_id = 'm-1'"
                )
            }
        }
    }

    @Test("upgrading marks a change held before v12 as waiting for new fields, and no other")
    func upgradeBackfillsHoldReason() throws {
        let queue = try DatabaseQueue()
        try ReplicaSchema.migrator().migrate(queue, upTo: "v11_nullable_catalogue_revision")
        try queue.write { db in
            try Self.insertQueued("held", heldAfter: 3, in: db)
            try Self.insertQueued("free", heldAfter: nil, in: db)
        }

        try ReplicaSchema.migrator().migrate(queue)

        try queue.read { db in
            let holds = try Row.fetchAll(
                db, sql: "SELECT mutation_id, catalogue_hold, catalogue_changes FROM mutation_log"
            ).reduce(into: [String: String?]()) { holds, row in
                let changes: String? = row["catalogue_changes"]
                #expect(changes == nil)
                let id: String = row["mutation_id"]
                let hold: String? = row["catalogue_hold"]
                holds[id] = hold
            }
            let expected: [String: String?] = ["held": "new_fields", "free": nil]
            #expect(holds == expected)
            let entry = try #require(try MutationLogRows.entry(mutationId: "held", in: db))
            #expect(entry.catalogueHold == .newFields)
        }
    }

    private static func insertQueued(_ id: String, heldAfter: Int?, in db: Database) throws {
        let command = try StoredJSON.encode(
            StoredCommand(.command(.setItemQuantity(id: "item-1", quantity: 2))))
        try db.execute(
            sql: """
                INSERT INTO mutation_log (mutation_id, entity_kind, entity_id, command,
                    depends_on, state, touched, created_at, awaiting_catalogue_after)
                VALUES (?, 'item', 'item-1', ?, '[]', 'queued', '[]', 0, ?)
                """, arguments: [id, command, heldAfter])
    }

    private static func mutationLogColumns(_ db: Database) throws -> Set<String> {
        Set(try db.columns(in: "mutation_log").map(\.name))
    }
}
