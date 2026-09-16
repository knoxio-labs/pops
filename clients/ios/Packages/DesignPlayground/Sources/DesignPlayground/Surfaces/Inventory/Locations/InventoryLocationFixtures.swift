/// Location trees, once each, for every state POPS-3985 requires.
internal enum InventoryLocationFixtures {
    internal static let empty = InventoryLocationTree(nodes: [])

    internal static let oneRoot = InventoryLocationTree(nodes: [
        InventoryLocationNode(id: "home", name: "Home", directItemCount: 3, directContainerCount: 1)
    ])

    internal static let small = InventoryLocationTree(nodes: [
        InventoryLocationNode(id: "home", name: "Home"),
        InventoryLocationNode(
            id: "garage", name: "Garage", parentID: "home", directItemCount: 4,
            directContainerCount: 2),
        InventoryLocationNode(
            id: "garage-tools", name: "Garage tools shelf", parentID: "garage",
            directItemCount: 12, directContainerCount: 1),
        InventoryLocationNode(id: "study", name: "Study", parentID: "home", directItemCount: 2),
        InventoryLocationNode(
            id: "hall-cupboard", name: "Hall cupboard", parentID: "home", directContainerCount: 3),
    ])

    internal static let deep: InventoryLocationTree = {
        let names = [
            "Home", "Self-storage", "Unit 214", "Back wall", "Stacked crates", "Crate 3",
            "Inner tray", "Small parts bag",
        ]
        var nodes: [InventoryLocationNode] = []
        var parent: String?
        for (index, name) in names.enumerated() {
            let id = "deep-\(index)"
            nodes.append(
                InventoryLocationNode(
                    id: id, name: name, parentID: parent,
                    directItemCount: index == names.count - 1 ? 6 : 0))
            parent = id
        }
        return InventoryLocationTree(nodes: nodes)
    }()

    internal static let longNames = InventoryLocationTree(nodes: [
        InventoryLocationNode(id: "home", name: "Home"),
        InventoryLocationNode(
            id: "closet",
            name: "The walk-in closet under the stairs that also holds the vacuum and the "
                + "ironing board",
            parentID: "home", directItemCount: 7),
    ])

    internal static let hundreds: InventoryLocationTree = {
        var nodes = [InventoryLocationNode(id: "home", name: "Home")]
        for room in 1...12 {
            let roomID = "room-\(room)"
            nodes.append(InventoryLocationNode(id: roomID, name: "Room \(room)", parentID: "home"))
            for shelf in 1...12 {
                nodes.append(
                    InventoryLocationNode(
                        id: "\(roomID)-shelf-\(shelf)", name: "Shelf \(shelf)", parentID: roomID,
                        directItemCount: shelf))
            }
        }
        return InventoryLocationTree(nodes: nodes)
    }()

    internal static let recentDestinationIDs = ["garage-tools", "study"]
    internal static let favoriteDestinationIDs = ["hall-cupboard"]
    internal static let openContainerDestinations: [(id: String, name: String)] = [
        ("moving-crate-3", "Moving crate 3")
    ]
}
