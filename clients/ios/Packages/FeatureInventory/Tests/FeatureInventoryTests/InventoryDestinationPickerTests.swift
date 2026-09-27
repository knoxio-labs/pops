import Testing

@testable import FeatureInventory

@Suite("Inventory destination picker")
internal struct InventoryDestinationPickerTests {
    @Test("opens a single root one level down when it has children")
    func opensSingleRootWithChildren() {
        let tree = InventoryLocationTree(nodes: [
            InventoryLocationNode(id: "home", name: "Home"),
            InventoryLocationNode(id: "bedroom", name: "Bedroom", parentID: "home"),
        ])

        #expect(
            InventoryDestinationPickerState.initialPath(for: tree, offered: nil) == ["home"])
    }

    @Test("keeps the root level when there are multiple roots")
    func keepsMultipleRootsAtTopLevel() {
        let tree = InventoryLocationTree(nodes: [
            InventoryLocationNode(id: "home", name: "Home"),
            InventoryLocationNode(id: "garage", name: "Garage"),
            InventoryLocationNode(id: "bedroom", name: "Bedroom", parentID: "home"),
        ])

        #expect(InventoryDestinationPickerState.initialPath(for: tree, offered: nil).isEmpty)
    }

    @Test("keeps the root level when it has no children")
    func keepsLeafRootAtTopLevel() {
        let tree = InventoryLocationTree(
            nodes: [InventoryLocationNode(id: "home", name: "Home")])

        #expect(InventoryDestinationPickerState.initialPath(for: tree, offered: nil).isEmpty)
    }

    @Test("does not open into a root that cannot receive a moved location")
    func keepsInvalidMoveTargetAtTopLevel() {
        let tree = InventoryLocationTree(nodes: [
            InventoryLocationNode(id: "home", name: "Home"),
            InventoryLocationNode(id: "bedroom", name: "Bedroom", parentID: "home"),
        ])

        #expect(
            InventoryDestinationPickerState.initialPath(for: tree, offered: ["bedroom"]).isEmpty)
    }
}
