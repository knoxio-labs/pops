import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// POPS-4492: the log stores and sends only a catalogue revision the change
/// is judged against, never a 1 standing in for "none", on a fresh replica
/// and on one upgraded with changes still queued.
@Suite("Mutation log: catalogue revision")
internal struct MutationLogCatalogueRevisionTests {
    private typealias Setup = LocalComputedFixture

    private static func storedRevisions(_ replica: InventoryReplica) throws -> [String: Int?] {
        try replica.database.read { db in
            var revisions: [String: Int?] = [:]
            for row in try Row.fetchAll(
                db, sql: "SELECT mutation_id, catalogue_revision FROM mutation_log")
            {
                let id: String = row["mutation_id"]
                let revision: Int? = row["catalogue_revision"]
                revisions[id] = revision
            }
            return revisions
        }
    }

    private static func sent(_ replica: InventoryReplica) throws -> [String: Int?] {
        Dictionary(
            uniqueKeysWithValues: try replica.outboundMutations().map {
                ($0.mutationId, $0.catalogueRevision)
            })
    }

    @Test("a fresh replica logs and sends a protocol-1 change with no revision")
    func freshProtocol1HasNone() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp", revision: 4)])

        _ = try replica.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]),
            mutationId: "m1", clientTime: Fixture.created)

        let none: [String: Int?] = ["m1": nil]
        #expect(try Self.storedRevisions(replica) == none)
        #expect(try Self.sent(replica) == none)
    }

    @Test("with a catalogue on the phone, only what the server judges by one carries it")
    func revisionOnlyWhereJudged() throws {
        let replica = try LocalComputedValueTests.replica()

        _ = try replica.perform(
            .setItemQuantity(id: Setup.rack, quantity: 2), mutationId: "quantity",
            clientTime: Setup.time)
        _ = try replica.perform(
            .splitItem(id: Setup.rack, newItemId: Setup.elsewhere, quantity: 1),
            mutationId: "split", clientTime: Setup.time)
        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "edit")
        _ = try replica.perform(
            .setComputedOverride(
                id: Setup.box, fieldId: Setup.volume, value: try Setup.decimal("50")),
            mutationId: "override", clientTime: Setup.time)

        let expected: [String: Int?] = [
            "quantity": nil, "split": Setup.revision, "edit": Setup.revision,
            "override": Setup.revision,
        ]
        #expect(try Self.storedRevisions(replica) == expected)
        #expect(try Self.sent(replica) == expected)
    }

    @Test("a change sent with no revision and asked for a newer catalogue waits past the held one")
    func heldProtocol1ChangeStaysWithoutRevision() throws {
        let replica = try LocalComputedValueTests.replica()
        _ = try replica.perform(
            .setItemQuantity(id: Setup.rack, quantity: 2), mutationId: "q1",
            clientTime: Setup.time)

        let held = try replica.database.write { db in
            let entry = try #require(try MutationLogRows.entry(mutationId: "q1", in: db))
            let isHeld = try CatalogueUpdates.holdForUpdate(
                .rejected(reason: .catalogueUpdateRequired, message: "newer"), of: entry,
                mint: { "q2" }, in: db)
            #expect(isHeld)
            return try #require(try MutationLogRows.entry(mutationId: "q2", in: db))
        }
        #expect(held.awaitingCatalogueAfter == Setup.revision)
        #expect(held.catalogueRevision == nil)
        #expect(try replica.outboundMutations().isEmpty)

        try replica.store(
            InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(
                    revision: Setup.revision + 1, minimumProtocol: 2),
                types: Setup.catalogue.types))
        try replica.moveChangesAwaitingCatalogue()

        let none: [String: Int?] = ["q2": nil]
        #expect(try Self.sent(replica) == none)
    }

    @Test("upgrading keeps every queued row and its state, and clears only invented revisions")
    func upgradeKeepsRowsAndClearsInventedRevisions() throws {
        let queue = try Upgrade.queueAtV10()
        try queue.write { db in try Upgrade.seedMixedLog(in: db) }
        let before = try queue.read { db in try Upgrade.rowsExceptRevision(db) }

        try ReplicaSchema.migrator().migrate(queue)

        try queue.write { db in
            #expect(try Upgrade.rowsExceptRevision(db) == before)
            #expect(
                try Upgrade.revisions(db) == [
                    "p1": nil, "p2": 7, "p2-at-1": 1, "split": nil, "override": 5, "undo": nil,
                ])
            let entries = try MutationLogRows.entries(db)
            #expect(
                entries.map(\.mutationId) == [
                    "p1", "p2", "p2-at-1", "split", "override", "undo",
                ])
            #expect(entries.first { $0.mutationId == "p2" }?.awaitingCatalogueAfter == 6)
            let sent = try MutationLogWrites.outbound(excluding: [], in: db)
            #expect(
                sent.first { $0.entry.mutationId == "p1" }.map { $0.mutation.catalogueRevision }
                    == .some(nil))

            try Upgrade.insert(
                "after", .setItemQuantity(id: "lamp", quantity: 3), revision: nil, in: db)
            let seq = try Int64.fetchOne(
                db, sql: "SELECT local_seq FROM mutation_log WHERE mutation_id = 'after'")
            #expect(seq == 8)
        }
    }

    @Test("an upgraded split keeps revision 1 when this phone holds revision 1")
    func upgradeKeepsHeldRevisionOne() throws {
        let queue = try Upgrade.queueAtV10()
        try queue.write { db in
            try db.execute(
                sql: """
                    INSERT INTO catalogue_revision (revision, status, minimum_protocol)
                    VALUES (1, 'published', 2)
                    """)
            try Upgrade.insert(
                "split", .splitItem(id: "lamp", newItemId: "lamp-2", quantity: 1), revision: 1,
                in: db)
            try Upgrade.insert(
                "quantity", .setItemQuantity(id: "lamp", quantity: 1), revision: 1, in: db)
        }

        try ReplicaSchema.migrator().migrate(queue)

        let revisions = try queue.read { db in try Upgrade.revisions(db) }
        #expect(revisions == ["split": 1, "quantity": nil])
    }

    @Test("an empty log upgrades and then takes a change with no revision")
    func emptyLogUpgrades() throws {
        let queue = try Upgrade.queueAtV10()

        try ReplicaSchema.migrator().migrate(queue)

        try queue.write { db in
            try Upgrade.insert(
                "first", .setItemQuantity(id: "lamp", quantity: 1), revision: nil, in: db)
            #expect(try Upgrade.revisions(db) == ["first": nil])
        }
    }
}

/// Builds a replica as `v10_catalogue_update_hold` left it, and writes log
/// rows the way that build did.
private enum Upgrade {
    static func queueAtV10() throws -> DatabaseQueue {
        let queue = try DatabaseQueue()
        try ReplicaSchema.migrator().migrate(queue, upTo: "v10_catalogue_update_hold")
        return queue
    }

    /// One `mutation_log` row as the v10 build wrote it.
    struct LogRow {
        let id: String
        let command: String
        let revision: Int?
        var state = "queued"
        var dependsOn: [String] = []
        var attempts = 0
        var heldAfter: Int?

        init(_ id: String, _ command: InventoryCommand, revision: Int?) throws {
            self.id = id
            self.command = try StoredJSON.encode(StoredCommand(.command(command)))
            self.revision = revision
        }

        init(undo id: String, of target: String) throws {
            self.id = id
            command = try StoredJSON.encode(StoredCommand(.undo(of: target)))
            revision = 1
            dependsOn = [target]
        }
    }

    /// A protocol-1 edit, protocol-2 edits at 7 (deferred, held after 6) and
    /// at 1, a split, an override at 5 (rejected), an Undo, and a cancelled
    /// row whose `local_seq` (7) the counter must not hand out again.
    static func seedMixedLog(in db: Database) throws {
        let patch = [InventoryProtocol2FieldPatch(fieldId: "f", values: nil)]
        var deferred = try LogRow(
            "p2", .editProtocol2Item(id: "lamp", catalogueRevision: 7, values: patch),
            revision: 7)
        deferred.state = "deferred"
        deferred.dependsOn = ["p1"]
        deferred.attempts = 2
        deferred.heldAfter = 6
        var rejected = try LogRow(
            "override", .clearComputedOverride(id: "lamp", fieldId: "f"), revision: 5)
        rejected.state = "rejected"
        for row in [
            try LogRow(
                "p1", .editItem(id: "lamp", name: "Lamp", note: .unchanged, fields: [:]),
                revision: 1),
            deferred,
            try LogRow(
                "p2-at-1", .editProtocol2Item(id: "lamp", catalogueRevision: 1, values: patch),
                revision: 1),
            try LogRow(
                "split", .splitItem(id: "lamp", newItemId: "lamp-2", quantity: 1), revision: 1),
            rejected,
            try LogRow(undo: "undo", of: "p1"),
            try LogRow("cancelled", .setItemQuantity(id: "lamp", quantity: 1), revision: 1),
        ] {
            try insert(row, in: db)
        }
        try db.execute(sql: "DELETE FROM mutation_log WHERE mutation_id = 'cancelled'")
    }

    static func insert(
        _ id: String, _ command: InventoryCommand, revision: Int?, in db: Database
    ) throws {
        try insert(try LogRow(id, command, revision: revision), in: db)
    }

    static func insert(_ row: LogRow, in db: Database) throws {
        let columns =
            "mutation_id, entity_kind, entity_id, command, depends_on, state, touched, attempts, "
            + "created_at, awaiting_catalogue_after"
        let values: StatementArguments = [
            row.id, "item", "lamp", row.command, try StoredJSON.encode(row.dependsOn), row.state,
            "[]", row.attempts, 0, row.heldAfter,
        ]
        guard let revision = row.revision else {
            try db.execute(
                sql: "INSERT INTO mutation_log (\(columns)) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                arguments: values)
            return
        }
        try db.execute(
            sql: """
                INSERT INTO mutation_log (\(columns), catalogue_revision)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, arguments: values + [revision])
    }

    static func revisions(_ db: Database) throws -> [String: Int?] {
        var revisions: [String: Int?] = [:]
        for row in try Row.fetchAll(
            db, sql: "SELECT mutation_id, catalogue_revision FROM mutation_log")
        {
            let id: String = row["mutation_id"]
            let revision: Int? = row["catalogue_revision"]
            revisions[id] = revision
        }
        return revisions
    }

    /// Every column but `catalogue_revision`, row by row in log order.
    static func rowsExceptRevision(_ db: Database) throws -> [[String: String]] {
        try Row.fetchAll(db, sql: "SELECT * FROM mutation_log ORDER BY local_seq").map { row in
            var copy: [String: String] = [:]
            for column in row.columnNames where column != "catalogue_revision" {
                copy[column] = row[column].map { String(describing: $0) } ?? "NULL"
            }
            return copy
        }
    }
}
