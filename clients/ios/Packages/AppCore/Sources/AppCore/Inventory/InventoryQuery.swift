/// What any store's current state must be able to answer, in the shapes
/// ADR-002's iOS replica design lists: effective location, direct and
/// contained contents, in hand, open containers, recents, and FTS search. The
/// walk and the ranking behind each of these are `InventoryReplica`'s job (a
/// later slice); this is only the seam a query is built against, so a fake
/// can answer the same reads a GRDB-backed implementation does.
public protocol InventoryQuerySource: Sendable {
    func inventoryItem(id: String) -> InventoryItem?
    /// The item whose `code` matches, compared the way the pillar's own
    /// unique index does (case-insensitive). A scan of a tombstoned item's
    /// code answers nil, the same as an id lookup does (POPS-4108): the code
    /// stays reserved so it is never reissued, but the label no longer
    /// resolves to anything the phone shows.
    func inventoryItem(withCode code: String) -> InventoryItem?
    func inventoryLocation(id: String) -> InventoryLocation?
    func inventoryLocationTree() -> [InventoryLocation]
    /// Items resolving directly to this location or contained within
    /// something that does, walked as ADR-002 D2 describes.
    func inventoryContents(ofLocation locationId: String) -> [InventoryItem]
    /// Active items placed directly inside this container, not those inside
    /// a container within it.
    func inventoryContents(ofContainer containerId: String) -> [InventoryItem]
    func inventoryInHand() -> [InventoryItem]
    func inventoryOpenContainers() -> [InventoryItem]
    /// Every container not deleted, open or closed, active or not, wherever
    /// it is: the containers browser narrows these by state itself.
    func inventoryContainers() -> [InventoryItem]
    func inventoryRecents(limit: Int) -> [InventoryItem]
    /// The newest events across every item and location, newest first: the
    /// dashboard's Recent work (ADR-002, "Active packing, Settled home").
    func inventoryRecentEvents(limit: Int) -> [InventoryEvent]
    /// How many active items, active containers and live locations the
    /// replica holds. Inactive items are excluded, per D3.
    func inventoryCounts() -> InventoryCounts
    /// Every item the replica holds, tombstones excluded, in no promised
    /// order: the Items browser's catalogue before any query narrows it.
    /// Inactive items are included only when asked for, per D3.
    func inventoryItems(includeInactive: Bool) -> [InventoryItem]
    func inventorySearch(text: String, includeInactive: Bool) -> [InventoryItem]
    func inventoryItemHistory(itemId: String) -> [InventoryEvent]
    func inventoryLocationHistory(locationId: String) -> [InventoryEvent]
    func inventoryCatalogue() -> InventoryCatalogue
    func inventorySyncLedger() -> InventoryReplicaSyncLedger
    func inventoryReplicaStatus() -> InventoryReplicaStatus
}

/// A read `InventoryStore.observe(_:)` can serve, typed by the value it
/// streams. Each static factory below closes over an `InventoryQuerySource`
/// call already fixed to the return type it names, so a store never has to
/// recover a type it was only handed as an eraser — it just calls `read`.
public struct InventoryQuery<Value: Sendable>: Sendable {
    public let read: @Sendable (any InventoryQuerySource) -> Value

    /// A query over any combination of the source's reads, evaluated against
    /// one state, so a screen that needs several of them gets a consistent
    /// view in one stream rather than several streams it would have to line
    /// up itself.
    public init(_ read: @escaping @Sendable (any InventoryQuerySource) -> Value) {
        self.read = read
    }

    public static func item(id: String) -> InventoryQuery<InventoryItem?> {
        .init { $0.inventoryItem(id: id) }
    }

    public static func item(withCode code: String) -> InventoryQuery<InventoryItem?> {
        .init { $0.inventoryItem(withCode: code) }
    }

    public static func location(id: String) -> InventoryQuery<InventoryLocation?> {
        .init { $0.inventoryLocation(id: id) }
    }

    public static var locationTree: InventoryQuery<[InventoryLocation]> {
        .init { $0.inventoryLocationTree() }
    }

    public static func contents(ofLocation locationId: String) -> InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryContents(ofLocation: locationId) }
    }

    public static func contents(ofContainer containerId: String) -> InventoryQuery<[InventoryItem]>
    {
        .init { $0.inventoryContents(ofContainer: containerId) }
    }

    public static var inHand: InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryInHand() }
    }

    public static var openContainers: InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryOpenContainers() }
    }

    public static var containers: InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryContainers() }
    }

    public static func recents(limit: Int) -> InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryRecents(limit: limit) }
    }

    public static func recentEvents(limit: Int) -> InventoryQuery<[InventoryEvent]> {
        .init { $0.inventoryRecentEvents(limit: limit) }
    }

    public static var counts: InventoryQuery<InventoryCounts> {
        .init { $0.inventoryCounts() }
    }

    public static func items(includeInactive: Bool = false) -> InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryItems(includeInactive: includeInactive) }
    }

    public static func search(
        _ text: String, includeInactive: Bool = false
    ) -> InventoryQuery<[InventoryItem]> {
        .init { $0.inventorySearch(text: text, includeInactive: includeInactive) }
    }

    public static func history(itemId: String) -> InventoryQuery<[InventoryEvent]> {
        .init { $0.inventoryItemHistory(itemId: itemId) }
    }

    public static func history(locationId: String) -> InventoryQuery<[InventoryEvent]> {
        .init { $0.inventoryLocationHistory(locationId: locationId) }
    }

    public static var catalogue: InventoryQuery<InventoryCatalogue> {
        .init { $0.inventoryCatalogue() }
    }

    public static var syncLedger: InventoryQuery<InventoryReplicaSyncLedger> {
        .init { $0.inventorySyncLedger() }
    }

    public static var replicaStatus: InventoryQuery<InventoryReplicaStatus> {
        .init { $0.inventoryReplicaStatus() }
    }
}

/// The catalogue's size, as the dashboard's Browse tiles show it.
public struct InventoryCounts: Hashable, Sendable {
    public let items: Int
    public let containers: Int
    public let locations: Int

    public init(items: Int, containers: Int, locations: Int) {
        self.items = items
        self.containers = containers
        self.locations = locations
    }
}
