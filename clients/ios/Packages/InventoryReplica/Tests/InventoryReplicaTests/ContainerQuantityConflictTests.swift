import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// ADR-002 D3: a container is one physical thing, so its quantity is always
/// 1, and a grouped item (quantity greater than 1) can never be a container
/// or hold contents. Mirrors the server's `item-create.test.ts`,
/// `item-quantity.test.ts`, `item-type.test.ts` and `placement.test.ts`
/// coverage of `quantity_container_conflict`.
@Suite("Local reducer: container quantity conflicts (ADR-002 D3)")
internal struct ContainerQuantityConflictTests {
    static let time = Fixture.created.addingTimeInterval(60)
    private static let box = InventoryType(
        key: "storage_box", name: "Storage box", capabilities: [.containment], fields: [],
        legacyLabels: [])

    private static func replicaWithBoxCatalogue() throws -> InventoryReplica {
        let replica = try Fixture.downloaded(
            items: [
                Fixture.box("crate", placement: .hand),
                Fixture.item("screws", placement: .hand, quantity: 40),
            ])
        try replica.store(InventoryCatalogue(version: "cat-1", units: [], types: [Self.box]))
        return replica
    }

    @Test("creating a container with quantity greater than 1 is refused")
    func createRefusesGroupedContainer() throws {
        let replica = try Self.replicaWithBoxCatalogue()
        let newId = "30000000-0000-4000-8000-000000000001"

        #expect(
            throws: InventoryCommandError.rejected(
                reason: .quantityContainerConflict,
                message: "a container must have quantity exactly 1 (ADR-002 D3)")
        ) {
            try replica.perform(
                .createItem(
                    InventoryNewItem(
                        id: newId, name: "Bin", typeKey: "storage_box", quantity: 2,
                        placement: .hand)),
                mutationId: "m1", clientTime: Self.time)
        }
        #expect(try replica.read(.item(id: newId)) == nil)
    }

    @Test("creating a non-container with quantity greater than 1 is allowed")
    func createAllowsGroupedNonContainer() throws {
        let replica = try Self.replicaWithBoxCatalogue()
        let newId = "30000000-0000-4000-8000-000000000002"

        _ = try replica.perform(
            .createItem(
                InventoryNewItem(
                    id: newId, name: "Nails", typeKey: nil, quantity: 12, placement: .hand)
            ), mutationId: "m1", clientTime: Self.time)

        #expect(try replica.read(.item(id: newId))?.quantity.count == 12)
    }

    @Test("raising a container above quantity 1 is refused")
    func setQuantityRefusesOnContainer() throws {
        let replica = try Self.replicaWithBoxCatalogue()

        #expect(
            throws: InventoryCommandError.rejected(
                reason: .quantityContainerConflict,
                message: "container crate must have quantity exactly 1 (ADR-002 D3)")
        ) {
            try replica.perform(
                .setItemQuantity(id: "crate", quantity: 2), mutationId: "m1", clientTime: Self.time)
        }
        #expect(try replica.read(.item(id: "crate"))?.quantity.count == 1)
    }

    @Test("gaining containment while the item is a grouped quantity is refused")
    func changeTypeRefusesOnGroupedItem() throws {
        let replica = try Self.replicaWithBoxCatalogue()

        #expect(
            throws: InventoryCommandError.rejected(
                reason: .quantityContainerConflict,
                message: "a container must have quantity exactly 1 (ADR-002 D3)")
        ) {
            try replica.perform(
                .changeItemType(id: "screws", typeKey: "storage_box", fields: [:]),
                mutationId: "m1", clientTime: Self.time)
        }
        #expect(try replica.read(.item(id: "screws"))?.containment == nil)
    }

    @Test("storing into a container whose own quantity is greater than 1 is refused")
    func moveRefusesIntoGroupedContainer() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.box("drifted", placement: .hand, quantity: 2),
            Fixture.item("lamp", placement: .hand),
        ])

        #expect(
            throws: InventoryCommandError.rejected(
                reason: .quantityContainerConflict,
                message:
                    "item drifted has quantity 2; a grouped item cannot hold contents (ADR-002 D3)")
        ) {
            try replica.perform(
                .moveItem(id: "lamp", to: .container("drifted"), verb: .store), mutationId: "m1",
                clientTime: Self.time)
        }
        #expect(try replica.read(.item(id: "lamp"))?.placement == .hand)
    }
}
