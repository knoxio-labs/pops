import AppCore
import Foundation

@testable import FeatureInventory

/// The empty answer to every read, for a store that exists only to fail
/// writes.
private struct EmptyInventorySource: InventoryQuerySource {
    func inventoryItem(id: String) -> InventoryItem? { nil }
    func inventoryItem(withCode code: String) -> InventoryItem? { nil }
    func inventoryLocation(id: String) -> InventoryLocation? { nil }
    func inventoryLocationTree() -> [InventoryLocation] { [] }
    func inventoryContents(ofLocation locationId: String) -> [InventoryItem] { [] }
    func inventoryContents(ofContainer containerId: String) -> [InventoryItem] { [] }
    func inventoryInHand() -> [InventoryItem] { [] }
    func inventoryOpenContainers() -> [InventoryItem] { [] }
    func inventoryContainers() -> [InventoryItem] { [] }
    func inventoryItems(includeInactive: Bool) -> [InventoryItem] { [] }
    func inventoryRecents(limit: Int) -> [InventoryItem] { [] }
    func inventoryRecentEvents(limit: Int) -> [InventoryEvent] { [] }
    func inventoryCounts() -> InventoryCounts {
        InventoryCounts(items: 0, containers: 0, locations: 0)
    }
    func inventorySearch(text: String, includeInactive: Bool) -> [InventoryItem] { [] }
    func inventoryItemHistory(itemId: String) -> [InventoryEvent] { [] }
    func inventoryLocationHistory(locationId: String) -> [InventoryEvent] { [] }
    func inventoryCatalogue() -> InventoryCatalogue {
        InventoryCatalogue(version: "fake", units: [], types: [])
    }
    func inventorySyncLedger() -> InventoryReplicaSyncLedger { InventoryReplicaSyncLedger() }
    func inventoryReplicaStatus() -> InventoryReplicaStatus { .current }
}

/// A store whose every write fails with `.unavailable`, for a test of the
/// failure path that is not storage-specific.
internal struct FailingInventoryStore: InventoryStore {
    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        AsyncStream { continuation in
            continuation.yield(query.read(EmptyInventorySource()))
            continuation.finish()
        }
    }

    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        throw RepositoryError.unavailable
    }

    func undo(_ receipt: InventoryReceipt) async throws {}

    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws {
        throw RepositoryError.unavailable
    }

    func download() async throws { throw RepositoryError.unavailable }

    func refresh() async {}

    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        throw RepositoryError.unavailable
    }

    func status() -> AsyncStream<InventoryReplicaStatus> { AsyncStream { _ in } }
}

extension InventoryFixture {
    static func repair(
        _ id: String, on entityId: String, entityKind: InventoryEntityKind = .item,
        kind: InventoryRepairKind, field: String? = nil,
        options: [InventoryRepairOption] = [], suggestedCode: String? = nil,
        heldByName: String? = nil
    ) -> InventoryRepair {
        InventoryRepair(
            id: id, entityKind: entityKind, entityId: entityId, kind: kind, field: field,
            options: options, suggestedCode: suggestedCode, heldByName: heldByName,
            openedAt: epoch)
    }

    static func waitingMutation(
        _ mutationId: String, on entityId: String, command: InventoryCommand,
        progress: Double? = nil
    ) -> InventoryQueuedMutation {
        InventoryQueuedMutation(
            receipt: InventoryReceipt(
                mutationId: mutationId, entityKind: .item, entityId: entityId),
            command: command, enqueuedAt: epoch, progress: progress)
    }
}

extension InventorySyncViewModel {
    /// Starts observing and waits for the first answer, or gives up after a
    /// deadline so a store that never answers fails the test instead of
    /// hanging it.
    @discardableResult
    func startAndAwaitFirstAnswer() async -> (Task<Void, Never>, InventorySyncPage?) {
        let task = Task { await observe() }
        await awaitObservedCondition { [self] in phase != .loading }
        return (task, page)
    }

    /// Waits until `condition` holds against the latest answer, within the
    /// same deadline.
    func awaitPage(where condition: @escaping @Sendable (InventorySyncPage) -> Bool) async
        -> InventorySyncPage?
    {
        await awaitObservedCondition { [self] in page.map(condition) ?? false }
        return page
    }
}

extension InventoryRepairViewModel {
    @discardableResult
    func startAndAwaitFirstAnswer() async -> Task<Void, Never> {
        let task = Task { await observe() }
        await awaitObservedCondition { [self] in phase != .loading }
        return task
    }
}
