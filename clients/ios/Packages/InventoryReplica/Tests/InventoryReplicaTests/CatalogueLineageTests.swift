import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// Replacement lineage on stored catalogue revisions: kept as the server
/// sent it, filled in once for a revision stored before lineage existed,
/// and otherwise as immutable as the rest of the revision.
@Suite("Catalogue lineage")
internal struct CatalogueLineageTests {
    private typealias Fixture = RebaseFixture

    private static let brightness = "99999999-9999-4999-8999-999999999999"
    private static let archived = "2026-09-02T00:00:00.000Z"

    private static func replaced(lineage: String?) -> InventoryCatalogueSnapshot {
        Fixture.catalogue(
            2,
            [
                Fixture.field(
                    Fixture.lumens, key: "lumens", kind: .measurement, sortOrder: 0,
                    archivedAt: archived, replacedBy: lineage),
                Fixture.baseFields[1],
                Fixture.field(brightness, key: "brightness", kind: .measurement, sortOrder: 2),
            ])
    }

    private static func lineage(in replica: InventoryReplica) throws -> String? {
        try replica.catalogue(revision: 2)?.types.first?.fields.first { $0.id == Fixture.lumens }?
            .replacedBy
    }

    @Test("a stored revision keeps the lineage the server sent")
    func storesLineage() throws {
        let replica = try InventoryReplica()

        try replica.store(Self.replaced(lineage: Self.brightness))

        #expect(try Self.lineage(in: replica) == Self.brightness)
        let stored = try replica.catalogue(revision: 2)
        #expect(stored == Self.replaced(lineage: Self.brightness).inStoredOrder)
    }

    @Test("a revision stored without lineage takes it once when fetched again")
    func fillsMissingLineage() throws {
        let replica = try InventoryReplica()
        try replica.store(Self.replaced(lineage: nil))

        try replica.store(Self.replaced(lineage: Self.brightness))

        #expect(try Self.lineage(in: replica) == Self.brightness)
    }

    @Test("recorded lineage never changes, and nothing else in the revision may")
    func lineageIsImmutable() throws {
        let replica = try InventoryReplica()
        try replica.store(Self.replaced(lineage: Self.brightness))
        let relabelled = Fixture.catalogue(
            2,
            [
                Fixture.field(
                    Fixture.lumens, key: "lumens", label: "Glow", kind: .measurement,
                    sortOrder: 0, archivedAt: Self.archived),
                Fixture.baseFields[1],
                Fixture.field(Self.brightness, key: "brightness", kind: .measurement, sortOrder: 2),
            ])

        #expect(throws: InventoryReplicaError.self) {
            try replica.store(Self.replaced(lineage: Fixture.colour))
        }
        #expect(throws: InventoryReplicaError.self) { try replica.store(relabelled) }
        try replica.database.write { db in
            #expect(throws: DatabaseError.self) {
                try db.execute(sql: "UPDATE catalogue_field SET replaced_by = 'other'")
            }
            #expect(throws: DatabaseError.self) {
                try db.execute(sql: "UPDATE catalogue_field SET label = 'Changed'")
            }
            #expect(throws: DatabaseError.self) {
                try db.execute(sql: "UPDATE catalogue_type SET label = 'Changed'")
            }
        }
        #expect(try Self.lineage(in: replica) == Self.brightness)
    }

    @Test("withLineage keeps the type parent")
    func withLineageKeepsParent() throws {
        let catalogue = Fixture.catalogue(2, Fixture.baseFields)
        let parentTypeId = "ffffffff-ffff-4fff-8fff-ffffffffffff"
        let withParent = InventoryCatalogueSnapshot(
            revision: catalogue.revision,
            types: catalogue.types.map {
                InventoryCatalogueType(
                    id: $0.id, key: $0.key, label: $0.label, description: $0.description,
                    sortOrder: $0.sortOrder, fields: $0.fields, capabilities: $0.capabilities,
                    legacyLabels: $0.legacyLabels, presentation: $0.presentation,
                    archivedAt: $0.archivedAt, replacedBy: $0.replacedBy,
                    parentTypeId: parentTypeId)
            })

        let enriched = withParent.withLineage(from: catalogue)

        #expect(enriched.types.first?.parentTypeId == parentTypeId)
    }

    @Test("upgrading keeps every stored revision, with no lineage recorded")
    func upgradeKeepsRevisions() throws {
        let queue = try DatabaseQueue()
        try ReplicaSchema.migrator().migrate(queue, upTo: "v12_catalogue_hold_reason")
        try queue.write { db in
            try db.execute(
                sql: """
                    INSERT INTO catalogue_revision (revision, base_revision, status, minimum_protocol)
                    VALUES (1, NULL, 'published', 2)
                    """)
            try db.execute(
                sql: """
                    INSERT INTO catalogue_type (revision, id, key, label, sort_order, capabilities,
                        legacy_labels, presentation, archived_at)
                    VALUES (1, 'type-1', 'bulb', 'Bulb', 0, ?, ?, ?, NULL)
                    """,
                arguments: [
                    try StoredJSON.encode([String]()), try StoredJSON.encode([String]()),
                    try StoredJSON.encode(InventoryJSON.object([:])),
                ])
        }

        try ReplicaSchema.migrator().migrate(queue)

        try queue.read { db in
            let snapshot = try #require(try Protocol2CatalogueRows.read(revision: 1, in: db))
            #expect(snapshot.types.map(\.id) == ["type-1"])
            #expect(snapshot.types.first?.replacedBy == nil)
        }
    }
}
