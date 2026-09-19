import AppCore
import Testing

@Suite("InventoryLocationDeletion")
internal struct InventoryLocationDeletionTests {
    @Test("child places move to the parent while direct things become unlocated")
    func placesMoveThingsBecomeUnlocated() {
        let deletion = InventoryLocationDeletion(
            name: "Garage", parentName: "Home", childPlaces: 1, directContainers: 1,
            directItems: 2)

        #expect(
            deletion.confirmation
                == "1 place moves to Home. 1 container and 2 items become unlocated."
        )
    }

    @Test("direct items never follow a parent: they become unlocated even below a root")
    func itemsNeverMoveToTheParent() {
        let deletion = InventoryLocationDeletion(
            name: "Shelf", parentName: "Garage", childPlaces: 0, directContainers: 0,
            directItems: 1)

        #expect(deletion.confirmation == "1 item becomes unlocated.")
        #expect(!deletion.confirmation.contains("Garage"))
    }

    @Test("at the top level, child places move to the top level")
    func rootDeletion() {
        let deletion = InventoryLocationDeletion(
            name: "Home", parentName: nil, childPlaces: 2, directContainers: 0, directItems: 0)

        #expect(deletion.confirmation == "2 places move to the top level.")
    }

    @Test("an empty place says only it goes")
    func emptyPlace() {
        let deletion = InventoryLocationDeletion(
            name: "Loft", parentName: "Home", childPlaces: 0, directContainers: 0, directItems: 0)

        #expect(deletion.confirmation == "Only Loft is removed.")
    }
}
