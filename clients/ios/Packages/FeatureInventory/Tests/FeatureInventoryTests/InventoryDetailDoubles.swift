import AppCore
import AppCoreFakes
import Foundation
import Synchronization

@testable import FeatureInventory

/// An in-memory store that also records every command, every undo and every
/// repair choice it was asked for, so a test can assert what a view model sent rather than only
/// what the fake did with it.
///
/// `history` answers item history, which `InMemoryInventoryStore` does not:
/// its per-item history read is empty whatever events it was seeded with.
internal final class RecordingInventoryStore: InventoryStore {
    private let inner: InMemoryInventoryStore
    private let history: [InventoryEvent]
    private struct Log {
        var commands: [InventoryCommand] = []
        var undone: [InventoryReceipt] = []
        var resolutions: [InventoryRepairChoice] = []
    }

    private let log = Mutex(Log())

    internal init(_ inner: InMemoryInventoryStore, history: [InventoryEvent] = []) {
        self.inner = inner
        self.history = history
    }

    internal var commands: [InventoryCommand] { log.withLock { $0.commands } }
    internal var undone: [InventoryReceipt] { log.withLock { $0.undone } }
    internal var resolutions: [InventoryRepairChoice] { log.withLock { $0.resolutions } }

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
        log.withLock { $0.resolutions.append(choice) }
        try await inner.resolve(repairId, with: choice)
    }

    func download() async throws { try await inner.download() }

    func refresh() async { await inner.refresh() }

    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        try await inner.photo(sha256, variant: variant)
    }

    func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        try await inner.uploadPhoto(sha256: sha256, data: data, contentType: contentType)
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
    func inventoryItem(withCode code: String) -> InventoryItem? {
        base.inventoryItem(withCode: code)
    }
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
    func inventoryItems(includeInactive: Bool) -> [InventoryItem] {
        base.inventoryItems(includeInactive: includeInactive)
    }
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
    /// Starts observing and waits for the first answer, or gives up after a
    /// deadline so a store that never answers fails the test instead of
    /// hanging it.
    func startAndAwaitDetail() async -> (Task<Void, Never>, InventoryItemDetail?) {
        let task = Task { await observe() }
        await awaitObservedCondition { [self] in phase != .loading }
        return (task, detail)
    }

    /// Waits until `condition` holds against the latest answer, within the
    /// same deadline.
    func awaitDetail(where condition: @escaping @Sendable (InventoryItemDetail) -> Bool) async
        -> InventoryItemDetail?
    {
        await awaitObservedCondition { [self] in detail.map(condition) ?? false }
        return detail
    }
}
