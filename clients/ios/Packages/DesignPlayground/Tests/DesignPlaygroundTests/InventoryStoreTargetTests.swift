import Testing

@testable import DesignPlayground

/// Store here is one sheet for a container and for a place; what it offers
/// and where a new item lands depend on which one it was opened from.
@Suite("Store here target")
internal struct InventoryStoreTargetTests {
    private let kitchen = InventoryLocationNode(id: "kitchen", name: "Kitchen")

    private func thing(_ id: String, _ placement: InventoryPlacement) -> InventoryFoundationItem {
        InventoryFoundationItem(id: id, name: id, typeName: "Thing", placement: placement)
    }

    @Test("a place offers what is not directly in it, including what is in its boxes")
    func placeExcludesOnlyDirectContents() {
        let target = InventoryStoreTarget.location(kitchen)
        #expect(!target.accepts(thing("kettle", .direct(location: "Kitchen"))))
        #expect(
            target.accepts(
                thing("cup", .contained(location: "Kitchen", containers: ["Kitchen 12"]))))
        #expect(target.accepts(thing("tv", .direct(location: "Living room"))))
        #expect(target.accepts(thing("passport", .inHand(previous: nil))))
    }

    @Test("a container offers neither its own contents nor itself")
    func containerExcludesContentsAndItself() {
        let box = InventoryContainerFixtures.few
        let target = InventoryStoreTarget.container(box)
        #expect(
            !target.accepts(
                thing("cup", .contained(location: "Kitchen", containers: ["Kitchen 12"]))))
        #expect(!target.accepts(box.item))
        #expect(target.accepts(thing("tv", .direct(location: "Living room"))))
    }

    @Test("a new item lands directly in the place, or in the container where it is")
    func draftPlacement() {
        #expect(InventoryStoreTarget.location(kitchen).draftPlacement == .directLocation("Kitchen"))
        #expect(
            InventoryStoreTarget.container(InventoryContainerFixtures.few).draftPlacement
                == .currentContainer(container: "Kitchen 12", location: "Kitchen"))
        #expect(InventoryStoreTarget.location(kitchen).name == "Kitchen")
    }

    @Test("a placed container is offered as open or closed, with its item count")
    func containerDestination() {
        let open = InventoryDestination(
            container: InventoryPlacedContainer(
                id: "a", name: "A", isOpen: true,
                contents: [InventoryPlacedEntry(id: "x", name: "X", typeName: "T")]),
            at: kitchen)
        let closed = InventoryDestination(
            container: InventoryPlacedContainer(id: "b", name: "B"), at: kitchen)
        #expect(open.kind == .container)
        #expect(open.count == 1)
        #expect(open.detail == "Kitchen")
        #expect(closed.kind == .closedContainer)
        #expect(closed.count == nil)
        #expect(closed.isContainer)
        #expect(
            !InventoryDestination(place: kitchen, in: InventoryLocationTree(nodes: [kitchen]))
                .isContainer)
    }
}
