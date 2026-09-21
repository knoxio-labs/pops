/// Search and the Items browser's own data, built on
/// ``InventoryFoundationFixtures`` rather than beside it, so a result row and
/// the same row elsewhere show the same item.
internal enum InventorySearchFixtures {
    internal static let places = InventoryLocationFixtures.home

    internal static let records: [InventorySearchRecord] =
        InventoryFoundationFixtures.all.map(record) + extras.map(record)

    internal static let types: [String] =
        Array(Set(records.compactMap(\.item.typeName))).sorted()

    internal static let recentlyScanned: [InventorySearchRecord] =
        ["kitchen-12", "screws", "television", "router"].compactMap { id in
            records.first { $0.id == id }
        }

    /// Records whose local copy is older than the last sync, for the offline
    /// state.
    internal static let offlineStale: Set<String> = ["screws", "hdmi", "cable"]

    internal static func record(id: String) -> InventorySearchRecord? {
        records.first { $0.id == id }
    }

    private static func record(_ item: InventoryFoundationItem) -> InventorySearchRecord {
        InventorySearchRecord(
            item: item,
            externalIdentifier: externalIdentifiers[item.id],
            note: notes[item.id],
            capabilities: item.isContainer ? ["Can hold other items"] : [],
            photo: photoNames[item.id].flatMap(SamplePhoto.data),
            addedDaysAgo: addedDaysAgo[item.id] ?? 30)
    }

    private static let extras: [InventoryFoundationItem] = [
        InventoryFoundationItem(
            id: "hdmi", name: "HDMI cable, 2 m", typeName: "Cable", code: "C118", quantity: 3,
            placement: .contained(location: "Living room", containers: ["TV cabinet"])),
        InventoryFoundationItem(
            id: "measuring-tape", name: "Measuring tape", typeName: "Hand tool",
            placement: .contained(location: "Garage", containers: ["Garage tools"])),
        InventoryFoundationItem(
            id: "screwdrivers", name: "Screwdriver set", typeName: "Hand tool", code: "T012",
            placement: .direct(location: "Garage")),
        InventoryFoundationItem(
            id: "extension-lead", name: "Extension lead", typeName: "Cable",
            placement: .inHand(previous: "Study")),
        InventoryFoundationItem(
            id: "duvet", name: "Winter duvet", typeName: nil,
            placement: .contained(location: "Hall cupboard", containers: ["Linen 02"])),
        InventoryFoundationItem(
            id: "picture-hooks", name: "Picture hooks", typeName: "Fastener", quantity: 24,
            placement: .contained(location: "Study", containers: ["Office 04"])),
        InventoryFoundationItem(
            id: "spare-keys", name: "Spare keys", typeName: nil,
            placement: .direct(location: "Kitchen")),
        InventoryLifecycleFixtures.retiredRouter,
        InventoryFoundationItem(
            id: "bike-pump", name: "Bike pump", typeName: "Sports", code: "S003",
            placement: .direct(location: "Garage")),
    ]

    private static let photoNames: [String: String] = [
        "television": "television",
        "cable": "usb-cable",
        "screws": "wood-screws",
        "passport": "passport",
        "espresso": "espresso-machine-1",
        "kitchen-12": "moving-box",
        "tape": "gaffer-tape",
        "untyped": "tote-bag",
        "kettle": "kettle",
        "drill": "cordless-drill",
        "lamp": "reading-lamp",
        "router": "wifi-router",
        "router-old": "wifi-router",
    ]

    private static let addedDaysAgo: [String: Int] = [
        "screws": 1, "kitchen-12": 2, "hdmi": 3, "extension-lead": 4, "untyped": 5,
        "spare-keys": 6, "passport": 40, "television": 90,
    ]

    private static let externalIdentifiers: [String: String] = [
        "television": "Samsung QN65-2024",
        "drill": "DeWalt DCD796",
    ]

    private static let notes: [String: String] = [
        "espresso": "Steam wand needs descaling every three weeks.",
        "untyped": "Found in the move, not sure whose this is.",
    ]
}
