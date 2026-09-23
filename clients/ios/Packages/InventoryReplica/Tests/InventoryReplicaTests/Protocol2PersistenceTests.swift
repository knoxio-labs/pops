import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Protocol 2 catalogue and value persistence")
internal struct Protocol2PersistenceTests {
    private static let typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    private static let decimalFieldId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    private static let referenceFieldId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

    @Test("immutable revisions coexist and survive a relaunch")
    func revisionsSurviveRelaunch() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "Protocol2PersistenceTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        do {
            let replica = try onDisk(directory)
            try replica.store(Self.catalogue(revision: 1, label: "Cable"))
            try replica.store(Self.catalogue(revision: 2, label: "Lead"))
        }

        let reopened = try onDisk(directory)
        #expect(try reopened.catalogue(revision: 1)?.types[0].label == "Cable")
        #expect(try reopened.catalogue(revision: 2)?.types[0].label == "Lead")
        #expect(try reopened.catalogue(revision: 1)?.types[0].id == Self.typeId)
    }

    @Test("catalogue history survives a replica fallback")
    func revisionsSurviveFallback() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "Protocol2FallbackTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        do {
            let replica = try onDisk(directory)
            try replica.store(Self.catalogue(revision: 2, label: "Cable"))
            try replica.database.write { db in
                try db.execute(sql: "CREATE TABLE poison (marker INTEGER NOT NULL)")
            }
        }
        var migrator = ReplicaSchema.migrator()
        migrator.registerMigration("v8_fallback_test") { db in
            if try db.tableExists("poison") { throw Protocol2FallbackFailure() }
        }

        let databasePath = directory.appendingPathComponent("inventory.sqlite").path
        let queue = try ReplicaSchema.openOnDisk(at: databasePath, migrator: migrator)
        let catalogue = try queue.read {
            try Protocol2CatalogueRows.read(revision: 2, in: $0)
        }

        #expect(catalogue?.types[0].label == "Cable")
    }

    @Test("a revision cannot be replaced by different catalogue content")
    func revisionCannotBeReplaced() throws {
        let replica = try InventoryReplica()
        try replica.store(Self.catalogue(revision: 1, label: "Cable"))

        #expect(throws: InventoryReplicaError.self) {
            try replica.store(Self.catalogue(revision: 1, label: "Lead"))
        }
        #expect(try replica.catalogue(revision: 1)?.types[0].label == "Cable")
    }

    @Test("the catalogue and first dependent rows commit atomically")
    func atomicCatalogueAndRows() throws {
        let replica = try InventoryReplica()
        let values = [
            InventoryItemFieldEntry(
                fieldId: Self.decimalFieldId,
                state: .value([
                    .decimal(try InventoryDecimal("12.340")),
                    .decimal(try InventoryDecimal("1.000")),
                ]), source: .stored, catalogueRevision: 2)
        ]
        let item = Self.item("cable", revision: 1, values: values)
        let page = Self.snapshot(items: [item], revision: 2)

        #expect(throws: (any Error).self) { try replica.apply(page) }
        #expect(try replica.read(.item(id: "cable")) == nil)

        try replica.apply(page, catalogue: Self.catalogue(revision: 2, label: "Cable"))

        let stored = try #require(try replica.read(.item(id: "cable")))
        #expect(stored.catalogueRevision == 2)
        #expect(stored.typeId == Self.typeId)
        #expect(stored.fieldValues == values)
    }

    @Test("an arriving protocol-2 catalogue reindexes its type labels")
    func catalogueArrivalReindexesSearch() throws {
        let replica = try InventoryReplica()
        try replica.apply(
            Self.snapshot(items: [Self.item("cable", revision: 1)], revision: 1),
            catalogue: Self.catalogue(revision: 1, label: "Cable"))
        #expect(try replica.ids(.search("Cable")) == ["cable"])

        try replica.store(Self.catalogue(revision: 2, label: "Lead"))
        #expect(try replica.ids(.search("Cable")).isEmpty)
        #expect(try replica.ids(.search("Lead")) == ["cable"])
    }

    @Test("ordered values retain scale and duplicate ordinals")
    func orderedValues() throws {
        let replica = try InventoryReplica()
        let decimal = try InventoryDecimal("12.340")
        let values = [
            InventoryItemFieldEntry(
                fieldId: Self.decimalFieldId,
                state: .value([.decimal(decimal), .decimal(decimal)]), source: .stored,
                catalogueRevision: 3)
        ]

        try replica.apply(
            Self.snapshot(items: [Self.item("wire", revision: 1, values: values)], revision: 3),
            catalogue: Self.catalogue(revision: 3, label: "Cable"))

        #expect(try replica.read(.item(id: "wire"))?.fieldValues == values)
    }

    @Test("references retain identity when their target is missing or deleted")
    func referenceStates() throws {
        let replica = try InventoryReplica()
        let missing = InventoryReferenceValue(targetKind: .item, targetId: "missing")
        let deleted = InventoryReferenceValue(targetKind: .item, targetId: "deleted")
        let values = [
            InventoryItemFieldEntry(
                fieldId: Self.referenceFieldId,
                state: .value([.reference(missing), .reference(deleted)]), source: .stored,
                catalogueRevision: 4)
        ]
        let tombstone = InventoryItem(
            id: "deleted", revision: 1, seq: 1, name: "Deleted", typeKey: nil,
            placement: .hand, createdAt: Fixture.created, updatedAt: Fixture.created,
            deletedAt: Fixture.created)

        try replica.apply(
            Self.snapshot(
                items: [Self.item("owner", revision: 1, values: values), tombstone], revision: 4),
            catalogue: Self.catalogue(revision: 4, label: "Cable"))

        let stored = try #require(try replica.read(.item(id: "owner")))
        #expect(
            stored.fieldValues[0].state
                == .value([
                    .reference(
                        InventoryReferenceValue(
                            targetKind: .item, targetId: "missing", targetState: .missing)),
                    .reference(
                        InventoryReferenceValue(
                            targetKind: .item, targetId: "deleted", targetState: .deleted)),
                ]))
    }

    @Test("a queued mutation keeps its catalogue revision across a relaunch")
    func mutationRevisionSurvivesRelaunch() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "Protocol2MutationPinTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        do {
            let replica = try onDisk(directory)
            try replica.apply(
                Self.snapshot(items: [Self.item("cable", revision: 1)], revision: 7),
                catalogue: Self.catalogue(revision: 7, label: "Cable"))
            _ = try replica.perform(
                .editItem(id: "cable", name: "Lead", note: .unchanged, fields: [:]),
                mutationId: "mutation-1", clientTime: Fixture.created)
            #expect(try replica.outboundMutations().first?.catalogueRevision == 7)
        }

        let reopened = try onDisk(directory)
        #expect(try reopened.outboundMutations().first?.catalogueRevision == 7)
    }

    private static func catalogue(revision: Int, label: String) -> InventoryCatalogueSnapshot {
        let decimal = InventoryCatalogueField(
            id: decimalFieldId, typeId: typeId, key: "amount", label: "Amount", sortOrder: 0,
            kind: .decimal, cardinality: .many, required: false, storage: .stored)
        let reference = InventoryCatalogueField(
            id: referenceFieldId, typeId: typeId, key: "related", label: "Related",
            sortOrder: 1, kind: .reference, cardinality: .many, required: false,
            storage: .stored,
            references: InventoryReferenceConstraint(targetKinds: [.item]))
        return InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: typeId, key: "cable", label: label, sortOrder: 0,
                    fields: [decimal, reference])
            ])
    }

    private static func item(
        _ id: String, revision: Int, values: [InventoryItemFieldEntry] = []
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: revision, seq: revision,
            catalogueRevision: values.first?.catalogueRevision,
            name: id, typeId: typeId, typeKey: "cable", fieldValues: values,
            placement: .hand, createdAt: Fixture.created, updatedAt: Fixture.created)
    }

    private static func snapshot(
        items: [InventoryItem], revision: Int
    ) -> InventorySnapshotPage {
        InventorySnapshotPage(
            epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "catalogue-\(revision)",
            total: items.count, items: items, locations: [], nextCursor: nil,
            catalogueRevision: revision)
    }

    private func onDisk(_ directory: URL) throws -> InventoryReplica {
        try InventoryReplica(
            onDiskAt: directory, now: { Fixture.created }, freeBytes: { _ in .max })
    }
}

private struct Protocol2FallbackFailure: Error {}
