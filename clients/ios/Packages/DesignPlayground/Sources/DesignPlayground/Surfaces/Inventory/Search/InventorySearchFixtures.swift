/// Search and browse's own data, built on ``InventoryFoundationFixtures``
/// rather than beside it, so a row on a search result and the same row on the
/// foundation gallery show the same item.
internal enum InventorySearchFixtures {
    /// Two levels deep: a room, and the shelf or desk POPS-3979's placements
    /// already name. Deep enough to exercise a parent chain without
    /// inventing a hierarchy the fixtures do not otherwise use.
    internal static let locations: [InventoryLocationRecord] = [
        InventoryLocationRecord(
            id: "garage", name: "Garage", parentID: nil, itemCount: 4, containerCount: 2),
        InventoryLocationRecord(
            id: "kitchen", name: "Kitchen", parentID: nil, itemCount: 1, containerCount: 1),
        InventoryLocationRecord(
            id: "pantry-shelf", name: "Pantry shelf", parentID: "kitchen", itemCount: 11,
            containerCount: 0),
        InventoryLocationRecord(
            id: "study", name: "Study", parentID: nil, itemCount: 2, containerCount: 1),
        InventoryLocationRecord(
            id: "living-room", name: "Living room", parentID: nil, itemCount: 1, containerCount: 0),
        InventoryLocationRecord(
            id: "hall-cupboard", name: "Hall cupboard", parentID: nil, itemCount: 0,
            containerCount: 1),
    ]

    internal static let records: [InventorySearchRecord] = InventoryFoundationFixtures.all.map(
        record)

    /// What a reviewer sees on the empty search field: what they searched
    /// for before, oldest first is wrong, so newest first.
    internal static let recentQueries = ["screws", "router", "office 04"]

    /// What was found by scanning rather than typing. A subset of `records`,
    /// because a scan always resolves to something already in the
    /// catalogue.
    internal static let recentlyScanned: [InventorySearchRecord] =
        records.filter { ["kitchen-12", "screws"].contains($0.id) }

    private static func record(_ item: InventoryFoundationItem) -> InventorySearchRecord {
        InventorySearchRecord(
            item: item,
            externalIdentifier: externalIdentifiers[item.id],
            note: notes[item.id],
            capabilities: item.isContainer ? ["Can hold other items"] : [])
    }

    private static let externalIdentifiers: [String: String] = [
        "television": "Samsung QN65-2024",
        "drill": "DeWalt DCD796",
    ]

    private static let notes: [String: String] = [
        "espresso": "Steam wand needs descaling every three weeks.",
        "untyped": "Found in the move, not sure whose this is.",
    ]
}
