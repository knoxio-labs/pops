import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Mutation log: perform")
internal struct MutationLogPerformTests {
    static let crateId = "20000000-0000-4000-8000-0000000000c1"
    static let time = Fixture.created.addingTimeInterval(60)

    static func replica() throws -> InventoryReplica {
        try Fixture.downloaded(
            items: [
                Fixture.item("lamp", name: "Lamp", revision: 4),
                Fixture.item("mug", name: "Mug", revision: 2),
            ],
            locations: [Fixture.location("hall", revision: 3)])
    }

    @Test("perform shows the change at once and logs it queued, based on the revision seen")
    func performIsLocal() throws {
        let replica = try Self.replica()

        let receipt = try replica.perform(
            .moveItem(id: "lamp", to: .location("hall"), verb: .move), mutationId: "m1",
            clientTime: Self.time)

        #expect(receipt == InventoryReceipt(mutationId: "m1", entityKind: .item, entityId: "lamp"))
        let lamp = try #require(try replica.read(.item(id: "lamp")))
        #expect(lamp.placement == .location("hall"))
        #expect(lamp.revision == 5)
        #expect(lamp.updatedAt == Self.time)
        let sent = try #require(try replica.outboundMutations().first)
        #expect(sent.baseRevision == 4)
        #expect(sent.dependsOn.isEmpty)
        #expect(sent.clientTime == Self.time)
        #expect(try replica.read(.syncLedger).waiting.map(\.id) == ["m1"])
    }

    @Test("a command the server would refuse throws its reason and logs nothing")
    func refusalLogsNothing() throws {
        let replica = try Self.replica()

        #expect(
            throws: InventoryCommandError.rejected(
                reason: .notContainer, message: "item mug is not a container")
        ) {
            try replica.perform(
                .moveItem(id: "lamp", to: .container("mug"), verb: .store), mutationId: "m1",
                clientTime: Self.time)
        }
        #expect(
            throws: InventoryCommandError.rejected(
                reason: .targetMissing, message: "location gone does not exist")
        ) {
            try replica.perform(
                .moveItem(id: "lamp", to: .location("gone"), verb: .move), mutationId: "m2",
                clientTime: Self.time)
        }
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.read(.item(id: "lamp"))?.placement == .hand)
    }

    @Test(
        "a code another item holds collides offline, suggesting the next free one after the typed one"
    )
    func codeCollidesLocally() throws {
        let replica = try Self.replica()
        _ = try replica.perform(
            .setItemCode(id: "mug", code: "B412"), mutationId: "m1", clientTime: Self.time)

        #expect(
            throws: InventoryCommandError.codeCollision(
                heldById: "mug", heldByName: "Mug", suggestedCode: "b413")
        ) {
            try replica.perform(
                .setItemCode(id: "lamp", code: "b412"), mutationId: "m2", clientTime: Self.time)
        }
    }

    @Test("a change on top of a pending one depends on it and is based on the revision it leaves")
    func dependentChangeChains() throws {
        let replica = try Self.replica()
        _ = try replica.perform(
            .createItem(
                InventoryNewItem(id: Self.crateId, name: "Crate", typeKey: nil, placement: .hand)),
            mutationId: "create", clientTime: Self.time)
        _ = try replica.perform(
            .setItemCode(id: Self.crateId, code: "C1"), mutationId: "code", clientTime: Self.time)
        _ = try replica.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]),
            mutationId: "rename-1", clientTime: Self.time)
        _ = try replica.perform(
            .editItem(id: "lamp", name: "Floor lamp", note: .unchanged, fields: [:]),
            mutationId: "rename-2", clientTime: Self.time)

        let sent = Dictionary(
            uniqueKeysWithValues: try replica.outboundMutations().map { ($0.mutationId, $0) })
        #expect(sent["create"]?.baseRevision == nil)
        #expect(sent["code"]?.dependsOn == ["create"])
        #expect(sent["code"]?.baseRevision == 1)
        #expect(sent["rename-1"]?.baseRevision == 4)
        #expect(sent["rename-2"]?.dependsOn == ["rename-1"])
        #expect(sent["rename-2"]?.baseRevision == 5)
        #expect(try replica.read(.item(id: "lamp"))?.name == "Floor lamp")
    }

    @Test("a mutation id already in the log is refused rather than applied twice")
    func duplicateMutationIdRefused() throws {
        let replica = try Self.replica()
        _ = try replica.perform(
            .setItemQuantity(id: "lamp", quantity: 2), mutationId: "m1", clientTime: Self.time)

        #expect(throws: InventoryCommandError.self) {
            try replica.perform(
                .setItemQuantity(id: "lamp", quantity: 3), mutationId: "m1", clientTime: Self.time)
        }
        #expect(try replica.read(.item(id: "lamp"))?.quantity.count == 2)
    }

    /// LocalReducer resolves its own reindexing catalogue at init from
    /// SyncMeta.searchCatalogue(in:), the same call MutationLogReplay.rebase
    /// makes; a regression back to storedCatalogue() (protocol 1, never
    /// written for a protocol-2 replica) would wipe this item's type-label
    /// search text here without touching the feed-rebase path at all.
    @Test("a local command keeps the item's type-label search text under a protocol-2 catalogue")
    func performKeepsProtocol2TypeLabel() throws {
        let typeId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
        let replica = try InventoryReplica()
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(id: typeId, key: "widget", label: "Widget", sortOrder: 0)
            ]
        )
        let item = InventoryItem(
            id: "thing-1", revision: 1, seq: 1, name: "Distinct Item", typeId: typeId,
            typeKey: "widget", placement: .hand, createdAt: Fixture.created,
            updatedAt: Fixture.created)
        let page = InventorySnapshotPage(
            epoch: Fixture.epoch, highWaterSeq: 10, catalogueVersion: "catalogue-1", total: 1,
            items: [item], locations: [Fixture.location("hall")], nextCursor: nil,
            catalogueRevision: 1)
        try replica.apply(page, catalogue: catalogue)
        #expect(try replica.ids(.search("Widget")) == ["thing-1"])

        _ = try replica.perform(
            .moveItem(id: "thing-1", to: .location("hall"), verb: .move), mutationId: "m1",
            clientTime: Self.time)

        #expect(try replica.ids(.search("Widget")) == ["thing-1"])
    }
}
