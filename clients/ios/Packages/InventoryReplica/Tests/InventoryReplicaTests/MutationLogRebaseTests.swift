import AppCore
import Testing

@testable import InventoryReplica

@Suite("Mutation log: rebase on feed pages and outcomes")
internal struct MutationLogRebaseTests {
    private static let time = MutationLogPerformTests.time

    private static func renamed(_ replica: InventoryReplica) throws {
        _ = try replica.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]),
            mutationId: "m1", clientTime: Self.time)
    }

    @Test("a feed change under a pending edit rebases without losing the edit")
    func feedUnderPendingEdit() throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.renamed(replica)

        try replica.apply(
            Fixture.changes(items: [
                Fixture.item("lamp", name: "Lamp", revision: 5, placement: .location("hall"))
            ]))

        let lamp = try #require(try replica.read(.item(id: "lamp")))
        #expect(lamp.name == "Desk lamp")
        #expect(lamp.placement == .location("hall"))
        #expect(lamp.revision == 6)
        #expect(try replica.outboundMutations().first?.baseRevision == 4)
        #expect(try replica.ids(.contents(ofLocation: "hall")) == ["lamp"])
    }

    @Test("a feed change to the same field keeps showing this phone's pending value")
    func feedOnSameField() throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.renamed(replica)

        try replica.apply(
            Fixture.changes(items: [Fixture.item("lamp", name: "Floor lamp", revision: 5)]))

        #expect(try replica.read(.item(id: "lamp"))?.name == "Desk lamp")
        #expect(try replica.read(.search("desk")).map(\.id) == ["lamp"])
        #expect(try replica.read(.search("floor")).isEmpty)
    }

    @Test("a pending change whose target the feed deleted stops showing but stays logged")
    func feedDeletesTarget() throws {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .moveItem(id: "lamp", to: .location("hall"), verb: .move), mutationId: "m1",
            clientTime: Self.time)

        try replica.apply(
            Fixture.changes(locations: [
                Fixture.location("hall", revision: 4, deletedAt: Fixture.created)
            ]))

        #expect(try replica.read(.item(id: "lamp"))?.placement == .hand)
        #expect(try replica.outboundMutations().map(\.mutationId) == ["m1"])
    }

    @Test("an applied change keeps showing at the server's revision until the feed catches up")
    func appliedWaitsForFeed() throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.renamed(replica)
        try replica.markSending(["m1"], at: Self.time)
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .applied(revision: 7, seq: 15, converged: false)],
                highWaterSeq: 15))

        let pending = try #require(try replica.read(.item(id: "lamp")))
        #expect(pending.name == "Desk lamp")
        #expect(pending.revision == 7)
        #expect(try replica.read(.syncLedger).waiting.isEmpty)

        try replica.apply(
            Fixture.changes(
                items: [Fixture.item("lamp", name: "Desk lamp", revision: 7)], nextSince: 15))

        #expect(
            try replica.read(.item(id: "lamp"))
                == Fixture.item("lamp", name: "Desk lamp", revision: 7))
    }

    @Test("a conflicted or rejected change stops showing, and the row shows the server's state")
    func conflictStopsReplay() throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.renamed(replica)
        _ = try replica.perform(
            .setItemQuantity(id: "mug", quantity: 5), mutationId: "m2", clientTime: Self.time)
        try replica.markSending(["m1", "m2"], at: Self.time)

        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: [
                    "m1": .conflictField(
                        field: "name", mine: "Desk lamp", theirs: "Floor lamp",
                        source: .otherDevice(label: "iPad"), at: Self.time, currentRevision: 5),
                    "m2": .rejected(reason: .invalid, message: "no"),
                ], highWaterSeq: 16))

        #expect(try replica.read(.item(id: "lamp"))?.name == "Lamp")
        #expect(try replica.read(.item(id: "mug"))?.quantity.count == 1)
        #expect(try replica.outboundMutations().isEmpty)
    }

    @Test("an applied outcome rebases the next change to the same entity on its revision")
    func outcomeRebasesChain() throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.renamed(replica)
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 3), mutationId: "m2", clientTime: Self.time)
        #expect(try replica.outboundMutations().map(\.baseRevision) == [4, 5])
        try replica.markSending(["m1"], at: Self.time)

        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: ["m1": .applied(revision: 9, seq: 20, converged: false)],
                highWaterSeq: 20))

        let next = try #require(try replica.outboundMutations().first)
        #expect(next.mutationId == "m2")
        #expect(next.baseRevision == 9)
        #expect(try replica.read(.item(id: "lamp"))?.revision == 10)
    }

    @Test("a batch that never reached the server goes back to the queue under the same ids")
    func returnToQueue() throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.renamed(replica)
        try replica.markSending(["m1"], at: Self.time)
        #expect(try replica.outboundMutations().isEmpty)

        try replica.returnToQueue(["m1"])

        #expect(try replica.outboundMutations().map(\.mutationId) == ["m1"])
        #expect(try replica.read(.item(id: "lamp"))?.name == "Desk lamp")
    }

    @Test("a resync keeps the log and replays it over the fresh snapshot")
    func resyncKeepsLog() throws {
        let replica = try MutationLogPerformTests.replica()
        try Self.renamed(replica)

        try replica.resetForResync()
        #expect(try replica.read(.item(id: "lamp")) == nil)
        try replica.apply(
            Fixture.snapshot(
                items: [Fixture.item("lamp", name: "Lamp", revision: 4)], epoch: "epoch-2"))

        #expect(try replica.read(.item(id: "lamp"))?.name == "Desk lamp")
        #expect(try replica.outboundMutations().map(\.mutationId) == ["m1"])
    }

    /// `resetView` (called for every rebased row) reindexes search through
    /// `SyncMeta.searchCatalogue(in:)`, which for a protocol-2 replica must
    /// resolve the stored protocol-2 revision rather than the never-written
    /// protocol-1 `catalogue` field. A feed page that never carries a
    /// catalogue still puts its item through this path, so this stays
    /// independent of the reindex `InventoryReplica.apply(_:catalogue:)`
    /// does directly.
    @Test("a feed change under a protocol-2 catalogue keeps the item's type-label search text")
    func feedRebaseKeepsProtocol2TypeLabel() throws {
        let typeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        let replica = try InventoryReplica()
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
            types: [InventoryCatalogueType(id: typeId, key: "gadget", label: "Gadget", sortOrder: 0)]
        )
        let item = InventoryItem(
            id: "widget-9", revision: 1, seq: 1, name: "Item Nine", typeId: typeId,
            typeKey: "gadget", placement: .hand, createdAt: Fixture.created,
            updatedAt: Fixture.created)
        let page = InventorySnapshotPage(
            epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "catalogue-1", total: 1,
            items: [item], locations: [], nextCursor: nil, catalogueRevision: 1)
        try replica.apply(page, catalogue: catalogue)
        #expect(try replica.ids(.search("Gadget")) == ["widget-9"])

        let moved = InventoryItem(
            id: "widget-9", revision: 2, seq: 2, name: "Item Nine", typeId: typeId,
            typeKey: "gadget", placement: .location("shelf"), createdAt: Fixture.created,
            updatedAt: Fixture.created.addingTimeInterval(1))
        let changes = InventoryChangesPage(
            epoch: Fixture.epoch, items: [moved], locations: [], events: [], nextSince: 20,
            hasMore: false, catalogueVersion: "catalogue-1", catalogueRevision: 1)
        try replica.apply(changes)

        #expect(try replica.ids(.search("Gadget")) == ["widget-9"])
    }
}
