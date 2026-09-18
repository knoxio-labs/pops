import AppCore
import AppCoreFakes
import Foundation
import Synchronization

@testable import FeatureInventory

/// An in-memory store that also records every command and every undo it was
/// asked for, so a test can assert what a view model sent rather than only
/// what the fake did with it.
///
/// `history` answers item history, which `InMemoryInventoryStore` does not:
/// its per-item history read is empty whatever events it was seeded with.
internal final class RecordingInventoryStore: InventoryStore {
    private let inner: InMemoryInventoryStore
    private let history: [InventoryEvent]
    private let log = Mutex<(commands: [InventoryCommand], undone: [InventoryReceipt])>(([], []))

    internal init(_ inner: InMemoryInventoryStore, history: [InventoryEvent] = []) {
        self.inner = inner
        self.history = history
    }

    internal var commands: [InventoryCommand] { log.withLock { $0.commands } }
    internal var undone: [InventoryReceipt] { log.withLock { $0.undone } }

    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        let history = history
        return inner.observe(
            InventoryQuery { query.read(InventoryHistoryOverlay(base: $0, events: history)) })
    }

    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        log.withLock { $0.commands.append(command) }
        return try await inner.perform(command)
    }

    func undo(_ receipt: InventoryReceipt) async throws {
        log.withLock { $0.undone.append(receipt) }
        try await inner.undo(receipt)
    }

    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws {
        try await inner.resolve(repairId, with: choice)
    }

    func download() async throws { try await inner.download() }

    func refresh() async { await inner.refresh() }

    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        try await inner.photo(sha256, variant: variant)
    }

    func status() -> AsyncStream<InventoryReplicaStatus> { inner.status() }
}

/// A query source that answers item history from `events` and forwards every
/// other read.
internal struct InventoryHistoryOverlay: InventoryQuerySource {
    let base: any InventoryQuerySource
    let events: [InventoryEvent]

    func inventoryItemHistory(itemId: String) -> [InventoryEvent] {
        events.filter { $0.entityKind == .item && $0.entityId == itemId }
    }

    func inventoryItem(id: String) -> InventoryItem? { base.inventoryItem(id: id) }
    func inventoryLocation(id: String) -> InventoryLocation? { base.inventoryLocation(id: id) }
    func inventoryLocationTree() -> [InventoryLocation] { base.inventoryLocationTree() }
    func inventoryContents(ofLocation locationId: String) -> [InventoryItem] {
        base.inventoryContents(ofLocation: locationId)
    }
    func inventoryContents(ofContainer containerId: String) -> [InventoryItem] {
        base.inventoryContents(ofContainer: containerId)
    }
    func inventoryInHand() -> [InventoryItem] { base.inventoryInHand() }
    func inventoryOpenContainers() -> [InventoryItem] { base.inventoryOpenContainers() }
    func inventoryContainers() -> [InventoryItem] { base.inventoryContainers() }
    func inventoryRecents(limit: Int) -> [InventoryItem] { base.inventoryRecents(limit: limit) }
    func inventoryRecentEvents(limit: Int) -> [InventoryEvent] {
        base.inventoryRecentEvents(limit: limit)
    }
    func inventoryCounts() -> InventoryCounts { base.inventoryCounts() }
    func inventorySearch(text: String, includeInactive: Bool) -> [InventoryItem] {
        base.inventorySearch(text: text, includeInactive: includeInactive)
    }
    func inventoryLocationHistory(locationId: String) -> [InventoryEvent] {
        base.inventoryLocationHistory(locationId: locationId)
    }
    func inventoryCatalogue() -> InventoryCatalogue { base.inventoryCatalogue() }
    func inventorySyncLedger() -> InventoryReplicaSyncLedger { base.inventorySyncLedger() }
    func inventoryReplicaStatus() -> InventoryReplicaStatus { base.inventoryReplicaStatus() }
}

extension InventoryItemDetailViewModel {
    /// Starts observing and waits for the first answer, within a bounded
    /// number of scheduler turns so a store that never answers fails the
    /// test instead of hanging it.
    func startAndAwaitDetail() async -> (Task<Void, Never>, InventoryItemDetail?) {
        let task = Task { await observe() }
        for _ in 0..<1_000 where phase == .loading {
            await Task.yield()
        }
        return (task, detail)
    }

    /// Waits until `condition` holds against the latest answer.
    func awaitDetail(where condition: (InventoryItemDetail) -> Bool) async -> InventoryItemDetail? {
        for _ in 0..<1_000 {
            if let detail, condition(detail) { return detail }
            await Task.yield()
        }
        return nil
    }
}
