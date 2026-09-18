/// What any store's current state must be able to answer, in the shapes
/// ADR-002's iOS replica design lists: effective location, direct and
/// contained contents, in hand, open containers, recents, and FTS search. The
/// walk and the ranking behind each of these are `InventoryReplica`'s job (a
/// later slice); this is only the seam a query is built against, so a fake
/// can answer the same reads a GRDB-backed implementation does.
public protocol InventoryQuerySource: Sendable {
    func inventoryItem(id: String) -> InventoryItem?
    func inventoryLocation(id: String) -> InventoryLocation?
    func inventoryLocationTree() -> [InventoryLocation]
    /// Items resolving directly to this location or contained within
    /// something that does, walked as ADR-002 D2 describes.
    func inventoryContents(ofLocation locationId: String) -> [InventoryItem]
    func inventoryInHand() -> [InventoryItem]
    func inventoryOpenContainers() -> [InventoryItem]
    func inventoryRecents(limit: Int) -> [InventoryItem]
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

    private init(_ read: @escaping @Sendable (any InventoryQuerySource) -> Value) {
        self.read = read
    }

    public static func item(id: String) -> InventoryQuery<InventoryItem?> {
        .init { $0.inventoryItem(id: id) }
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

    public static var inHand: InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryInHand() }
    }

    public static var openContainers: InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryOpenContainers() }
    }

    public static func recents(limit: Int) -> InventoryQuery<[InventoryItem]> {
        .init { $0.inventoryRecents(limit: limit) }
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
