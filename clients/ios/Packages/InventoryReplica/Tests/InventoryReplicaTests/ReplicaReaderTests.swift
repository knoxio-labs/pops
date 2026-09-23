import AppCore
import Testing

@testable import InventoryReplica

@Suite("ReplicaReader: catalogue reads")
internal struct ReplicaReaderTests {
    private static let typeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

    /// POPS-4433: a protocol-2-only replica never writes the legacy
    /// `sync_meta.catalogue` column, so a reader resolving the catalogue via
    /// `storedCatalogue()` always saw nil here and answered
    /// `InventoryReplica.emptyCatalogue`, even though the replica holds a
    /// perfectly good protocol-2 catalogue revision.
    @Test("inventoryCatalogue answers the protocol-2 type set, not the empty catalogue")
    func catalogueReadsProtocol2TypeSet() throws {
        let replica = try InventoryReplica()
        try replica.apply(
            Self.snapshot(items: [Self.item("wire", revision: 1)], revision: 1),
            catalogue: Self.catalogue(revision: 1, label: "Cable"))

        let catalogue = try replica.read(.catalogue)

        #expect(catalogue != InventoryReplica.emptyCatalogue)
        #expect(catalogue.type(forKey: "cable")?.name == "Cable")
    }

    private static func catalogue(revision: Int, label: String) -> InventoryCatalogueSnapshot {
        InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: typeId, key: "cable", label: label, sortOrder: 0, fields: [])
            ])
    }

    private static func item(_ id: String, revision: Int) -> InventoryItem {
        InventoryItem(
            id: id, revision: revision, seq: revision, name: id, typeId: typeId, typeKey: "cable",
            placement: .hand, createdAt: Fixture.created, updatedAt: Fixture.created)
    }

    private static func snapshot(items: [InventoryItem], revision: Int) -> InventorySnapshotPage {
        InventorySnapshotPage(
            epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "catalogue-\(revision)",
            total: items.count, items: items, locations: [], nextCursor: nil,
            catalogueRevision: revision)
    }
}
