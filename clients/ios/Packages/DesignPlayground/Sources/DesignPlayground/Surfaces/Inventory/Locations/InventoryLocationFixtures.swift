/// The place trees every Locations state is drawn from, in the names the
/// dashboard and the container screens already use.
internal enum InventoryLocationFixtures {
    private static func entry(
        _ id: String, _ name: String, _ type: String, _ symbol: String = "cube",
        quantity: Int = 1
    ) -> InventoryPlacedEntry {
        InventoryPlacedEntry(id: id, name: name, typeName: type, symbol: symbol, quantity: quantity)
    }

    private typealias Containers = InventoryContainerFixtures

    private static func placed(_ profile: InventoryContainerProfile) -> InventoryPlacedContainer {
        InventoryPlacedContainer(
            id: profile.id, name: profile.item.name, isOpen: profile.isOpen,
            contents: profile.contents.entries.map { entry in
                InventoryPlacedEntry(
                    id: entry.id, name: entry.item.name, typeName: entry.item.typeName ?? "",
                    symbol: entry.item.symbol.system, quantity: entry.item.quantity.count)
            })
    }

    private static let pantry: [InventoryPlacedEntry] = [
        "Olive oil", "Rice", "Pasta", "Flour", "Sugar", "Coffee beans", "Tea", "Honey", "Oats",
        "Lentils", "Chickpeas", "Tinned tomatoes",
    ].map { entry("pantry-\($0)", $0, "Pantry", "takeoutbag.and.cup.and.straw") }

    private static let homeRooms: [InventoryLocationNode] = [
        InventoryLocationNode(
            id: "kitchen", name: "Kitchen", parentID: "home",
            items: [entry("kettle", "Kettle", "Kitchen appliance", "cup.and.saucer")],
            containers: [placed(Containers.few)]),
        InventoryLocationNode(
            id: "pantry-shelf", name: "Pantry shelf", kind: .shelf, parentID: "kitchen",
            items: pantry),
        InventoryLocationNode(
            id: "cutlery-drawer", name: "Cutlery drawer", kind: .drawer, parentID: "kitchen",
            items: [entry("knives", "Steak knives", "Cutlery", "fork.knife", quantity: 6)]),
        InventoryLocationNode(
            id: "study", name: "Study", parentID: "home",
            items: [entry("lamp", "Reading lamp", "Lighting", "lamp.desk")],
            containers: [placed(Containers.many), placed(Containers.full)]),
        InventoryLocationNode(
            id: "bookshelf", name: "Bookshelf", kind: .shelf, parentID: "study",
            items: [entry("atlas", "Road atlas", "Book", "book.closed")]),
        InventoryLocationNode(
            id: "garage", name: "Garage", parentID: "home",
            containers: [
                Containers.garageTools, Containers.stale, Containers.stored, Containers.retired,
            ].map(placed)),
        InventoryLocationNode(
            id: "tool-wall", name: "Tool wall", kind: .shelf, parentID: "garage",
            items: [entry("screws", "Wood screws", "Fixings", "screwdriver", quantity: 200)]),
        InventoryLocationNode(
            id: "living-room", name: "Living room", parentID: "home",
            items: [
                entry("tv", "Television", "Electronics", "tv"),
                entry("router", "Wi-Fi router", "Network", "wifi.router"),
            ],
            containers: [placed(Containers.empty)]),
        InventoryLocationNode(
            id: "bedroom", name: "Bedroom", parentID: "home",
            containers: [placed(Containers.furniture)]),
        InventoryLocationNode(
            id: "hall-cupboard", name: "Hall cupboard", kind: .cupboard, parentID: "home",
            containers: [placed(Containers.closed)]),
    ]

    private static let elsewhere: [InventoryLocationNode] = [
        InventoryLocationNode(
            id: "car", name: "Car", kind: .vehicle,
            items: [
                entry("jump-leads", "Jump leads", "Car accessory", "bolt.car"),
                entry("tote", "Tote bag", "Bag", "bag"),
            ]),
        InventoryLocationNode(id: "self-storage", name: "Self-storage", kind: .storage),
        InventoryLocationNode(
            id: "unit-214", name: "Unit 214", kind: .storage, parentID: "self-storage",
            items: [entry("bike", "Road bike", "Bicycle", "bicycle")]),
        InventoryLocationNode(id: "mums-house", name: "Mum's house", kind: .elsewhere),
        InventoryLocationNode(
            id: "mums-garage", name: "Garage", parentID: "mums-house"),
        InventoryLocationNode(
            id: "back-wall", name: "Shelving along the back wall", kind: .shelf,
            parentID: "mums-garage"),
        InventoryLocationNode(
            id: "top-shelf", name: "Top shelf, left of the window", kind: .shelf,
            parentID: "back-wall"),
        InventoryLocationNode(
            id: "parts-drawer", name: "Small parts drawer with the blue label", kind: .drawer,
            parentID: "top-shelf",
            items: [
                entry("fuses", "Spare fuses", "Electrical", "bolt", quantity: 10),
                entry("allen", "Allen keys", "Hand tool", "wrench.adjustable", quantity: 8),
            ]),
    ]

    internal static let home = InventoryLocationTree(
        nodes: [InventoryLocationNode(id: "home", name: "Home", kind: .home)] + homeRooms
            + elsewhere)

    internal static let newHome = InventoryLocationTree(nodes: [
        InventoryLocationNode(id: "new-flat", name: "New flat", kind: .home),
        InventoryLocationNode(id: "new-kitchen", name: "Kitchen", parentID: "new-flat"),
        InventoryLocationNode(
            id: "new-lounge", name: "Lounge", parentID: "new-flat",
            containers: [
                InventoryPlacedContainer(
                    id: "crate-7", name: "Moving crate 7", isOpen: true,
                    contents: [entry("new-tv", "Television", "Electronics", "tv")])
            ]),
        InventoryLocationNode(id: "new-bedroom", name: "Bedroom", parentID: "new-flat"),
    ])

    internal static let empty = InventoryLocationTree(nodes: [])

    internal static let recentIDs = ["study", "garage", "hall-cupboard"]

    /// The open containers, in the order the dashboard lists them.
    internal static let openContainers: [InventoryDestination] = home.ordered.flatMap { place in
        place.containers.filter(\.isOpen).map { InventoryDestination(container: $0, at: place) }
    }
}
