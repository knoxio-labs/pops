import AppCore
import Foundation

/// The state `InMemoryInventoryStore` guards with its `Mutex`, and the
/// `InventoryQuerySource` conformance every `observe(_:)` reads through. Kept
/// out of the main file purely to stay under its type-body-length budget.
extension InMemoryInventoryStore {
    struct State: InventoryQuerySource {
        var items: [String: InventoryItem]
        var locations: [String: InventoryLocation]
        var catalogue: InventoryCatalogue
        var repairs: [InventoryRepair]
        var resolved: [InventoryResolvedEntry]
        var media: [String: Data]
        var replicaStatus: InventoryReplicaStatus
        var nextSeq: Int
        var undoLog: [String: UndoEntry] = [:]
        var observers: [UUID: Observer] = [:]

        func inventoryItem(id: String) -> InventoryItem? { items[id] }

        func inventoryLocation(id: String) -> InventoryLocation? { locations[id] }

        func inventoryLocationTree() -> [InventoryLocation] {
            locations.values.sorted { $0.sortOrder < $1.sortOrder }
        }

        func inventoryContents(ofLocation locationId: String) -> [InventoryItem] {
            items.values.filter { $0.placement == .location(locationId) }
                .sorted { $0.name < $1.name }
        }

        func inventoryInHand() -> [InventoryItem] {
            items.values.filter { $0.placement == .hand }.sorted { $0.name < $1.name }
        }

        func inventoryOpenContainers() -> [InventoryItem] {
            items.values.filter { $0.containment?.access == .open && $0.lifecycle == .active }
                .sorted { $0.name < $1.name }
        }

        func inventoryRecents(limit: Int) -> [InventoryItem] {
            Array(items.values.sorted { $0.updatedAt > $1.updatedAt }.prefix(limit))
        }

        func inventorySearch(text: String, includeInactive: Bool) -> [InventoryItem] {
            items.values.filter { item in
                (includeInactive || item.lifecycle == .active)
                    && item.name.localizedCaseInsensitiveContains(text)
            }.sorted { $0.name < $1.name }
        }

        func inventoryItemHistory(itemId: String) -> [InventoryEvent] { [] }

        func inventoryLocationHistory(locationId: String) -> [InventoryEvent] { [] }

        func inventoryCatalogue() -> InventoryCatalogue { catalogue }

        func inventorySyncLedger() -> InventoryReplicaSyncLedger {
            InventoryReplicaSyncLedger(waiting: [], repairs: repairs, resolved: resolved)
        }

        func inventoryReplicaStatus() -> InventoryReplicaStatus { replicaStatus }
    }
}
