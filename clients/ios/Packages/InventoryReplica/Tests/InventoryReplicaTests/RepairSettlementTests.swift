import AppCore
import Testing

@testable import InventoryReplica

/// POPS-4433: exercises settling a repair on a protocol-2-only replica end
/// to end (`RepairSettlement.settleResolvedElsewhere` -> `isAlreadyOnServer`,
/// then the feed's own `MutationLogReplay.rebase` reindex), asserting the
/// item's type stays searchable throughout.
///
/// `isAlreadyOnServer`'s dry run writes to the search index only inside a
/// savepoint that always rolls back, so no catalogue it passes there can
/// ever be observed: computing one (protocol-1 or protocol-2) only fed the
/// discarded write. `RepairSettlement.isAlreadyOnServer` now passes `nil`
/// instead of resolving a catalogue, removing the dead read rather than
/// leaving an untestable "fix" in place. This test guards the settlement
/// flow as a whole, including the real, non-discarded reindex that runs
/// afterward via the feed's `MutationLogReplay.rebase`.
@Suite("RepairSettlement: settling on a protocol-2-only replica")
internal struct RepairSettlementTests {
    private static let typeId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    private static let time = MutationLogPerformTests.time

    /// A protocol-2-only replica (never `store(_ catalogue: InventoryCatalogue)`)
    /// holding one item of a user-defined type.
    private static func replica() throws -> InventoryReplica {
        let replica = try InventoryReplica()
        try replica.apply(
            Self.snapshot(items: [Self.item("lamp", name: "Lamp", revision: 4)], revision: 1),
            catalogue: Self.catalogue(revision: 1, label: "Cable"))
        return replica
    }

    @Test(
        "a repair the feed shows already resolved elsewhere settles, and the type stays searchable"
    )
    func settlesAndKeepsTypeSearchable() throws {
        let replica = try Self.replica()
        _ = try replica.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]),
            mutationId: "m1", clientTime: Self.time)
        try RepairFixture.record(RepairFixture.renamedOnIPad, for: "m1", on: replica)
        #expect(try replica.ledger.repairs.map(\.id) == ["m1"])

        try replica.apply(
            Self.changes(items: [Self.item("lamp", name: "Desk lamp", revision: 6)]))

        #expect(try replica.ledger.repairs.isEmpty)
        #expect(try replica.ledger.resolved.map(\.outcome) == ["Already resolved elsewhere"])
        #expect(try replica.read(.item(id: "lamp"))?.name == "Desk lamp")
        #expect(try replica.ids(.search("Cable")) == ["lamp"])
    }

    private static func catalogue(revision: Int, label: String) -> InventoryCatalogueSnapshot {
        InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: typeId, key: "cable", label: label, sortOrder: 0, fields: [])
            ])
    }

    private static func item(_ id: String, name: String, revision: Int) -> InventoryItem {
        InventoryItem(
            id: id, revision: revision, seq: revision, name: name, typeId: typeId,
            typeKey: "cable", placement: .hand, createdAt: Fixture.created,
            updatedAt: Fixture.created)
    }

    private static func snapshot(items: [InventoryItem], revision: Int) -> InventorySnapshotPage {
        InventorySnapshotPage(
            epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "catalogue-\(revision)",
            total: items.count, items: items, locations: [], nextCursor: nil,
            catalogueRevision: revision)
    }

    private static func changes(items: [InventoryItem]) -> InventoryChangesPage {
        InventoryChangesPage(
            epoch: Fixture.epoch, items: items, locations: [], events: [], nextSince: 20,
            hasMore: false, catalogueVersion: "catalogue-1", catalogueRevision: 1)
    }
}
