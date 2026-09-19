import AppCore
import Foundation

@testable import FeatureInventory

/// A store that is still working on its first answer: every query stays open
/// and never yields, which is what the skeleton is for.
internal struct PendingInventoryStore: InventoryStore {
    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        AsyncStream { _ in }
    }

    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        throw RepositoryError.unavailable
    }

    func undo(_ receipt: InventoryReceipt) async throws {}

    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws {}

    func download() async throws {}

    func refresh() async {}

    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        throw RepositoryError.unavailable
    }

    func status() -> AsyncStream<InventoryReplicaStatus> { AsyncStream { _ in } }
}

internal enum InventoryFixture {
    static let epoch = Date(timeIntervalSinceReferenceDate: 800_000_000)

    static func location(_ id: String, _ name: String, deleted: Bool = false) -> InventoryLocation {
        InventoryLocation(
            id: id, revision: 1, seq: 1, name: name, parentId: nil, sortOrder: 0,
            deletedAt: deleted ? epoch : nil)
    }

    static func item(
        _ id: String, _ name: String, at placement: InventoryPlacement,
        previous: InventoryPreviousPlacement? = nil, access: InventoryAccess? = nil,
        lifecycle: InventoryLifecycle = .active, code: String? = nil, updatedAt: Date = epoch,
        deleted: Bool = false
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: name, typeKey: nil, code: code, lifecycle: lifecycle,
            placement: placement, previousPlacement: previous,
            containment: access.map { InventoryContainment(access: $0, isFull: false) },
            createdAt: epoch, updatedAt: updatedAt, deletedAt: deleted ? epoch : nil)
    }

    static func event(
        _ seq: Int, _ kind: InventoryEventKind, on entityId: String,
        entityKind: InventoryEntityKind = .item,
        after: [String: InventoryFieldValue] = [:], undoable: Bool = true
    ) -> InventoryEvent {
        InventoryEvent(
            seq: seq, entityKind: entityKind, entityId: entityId, kind: kind, fields: [],
            before: [:], after: after, reason: nil, actor: .web, clientTime: nil,
            serverTime: epoch.addingTimeInterval(TimeInterval(seq)), compensatesSeq: nil,
            undoable: undoable)
    }
}

extension InventoryDashboardViewModel {
    /// Starts observing and waits for the first answer, or gives up after a
    /// deadline so a store that never answers fails the test instead of
    /// hanging it.
    @discardableResult
    func startAndAwaitFirstAnswer() async -> (Task<Void, Never>, InventoryDashboard?) {
        let task = Task { await observe() }
        await awaitObservedCondition { [self] in phase != .loading }
        return (task, dashboard)
    }

    /// Waits until `condition` holds against the latest answer, within the
    /// same deadline.
    func awaitDashboard(where condition: @escaping @Sendable (InventoryDashboard) -> Bool) async
        -> InventoryDashboard?
    {
        await awaitObservedCondition { [self] in dashboard.map(condition) ?? false }
        return dashboard
    }
}
