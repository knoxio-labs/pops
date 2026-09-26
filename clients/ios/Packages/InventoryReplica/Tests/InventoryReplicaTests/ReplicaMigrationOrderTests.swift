import AppCore
import GRDB
import Testing

@testable import InventoryReplica

@Suite("Replica migration order")
internal struct ReplicaMigrationOrderTests {
    @Test(
        "a fresh replica applies catalogue lineage, defaults and type parents in order"
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
                "v15_catalogue_type_parent",
            ]
            #expect(Array(applied.suffix(8)) == expected)
            #expect(try db.tableExists(ComputedValueRows.localTableName))
            #expect(try Self.mutationLogColumns(db).contains("awaiting_catalogue_after"))
        }
    }

    @Test("upgrading a v13 catalogue keeps its rows with a nil parent")
    func upgradeKeepsCatalogueRowsWithoutParents() throws {
        let queue = try DatabaseQueue()
        let migrator = ReplicaSchema.migrator()
        try migrator.migrate(queue, upTo: "v13_catalogue_lineage")
        try queue.write { db in
            try db.execute(
                sql: """
                    INSERT INTO catalogue_revision (revision, base_revision, status, minimum_protocol)
                    VALUES (1, NULL, 'published', 2)
                    """)
            try db.execute(
                sql: """
                    INSERT INTO catalogue_type
                        (revision, id, key, label, sort_order, capabilities, legacy_labels,
                         presentation, archived_at, replaced_by)
                    VALUES (1, 'type-1', 'bulb', 'Bulb', 0, ?, ?, ?, NULL, NULL)
                    """,
                arguments: [
                    try StoredJSON.encode([String]()), try StoredJSON.encode([String]()),
                    try StoredJSON.encode(InventoryJSON.object([:])),
                ])
        }

        try migrator.migrate(queue)

        try queue.read { db in
            let row = try Row.fetchOne(
                db, sql: "SELECT id, parent_id FROM catalogue_type WHERE revision = 1")
            let id: String? = row?["id"]
            let parent: String? = row?["parent_id"]
            #expect(id == "type-1")
            #expect(parent == nil)
        }
    }

    @Test("a catalogue type parent cannot be changed after it is stored")
    func parentIsImmutable() throws {
        let replica = try InventoryReplica()
        try replica.store(
            InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
                types: [
                    InventoryCatalogueType(
                        id: "type-1", key: "bulb", label: "Bulb", sortOrder: 0)
                ]))

        #expect(throws: DatabaseError.self) {
            try replica.database.write { db in
                try db.execute(
                    sql: "UPDATE catalogue_type SET parent_id = 'type-2' WHERE id = 'type-1'")
            }
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
