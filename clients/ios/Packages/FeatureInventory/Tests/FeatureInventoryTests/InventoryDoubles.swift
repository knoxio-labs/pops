import AppCore
import AppCoreFakes
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
        lifecycle: InventoryLifecycle = .active, updatedAt: Date = epoch, deleted: Bool = false
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: name, typeKey: nil, lifecycle: lifecycle,
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
    /// bounded number of scheduler turns so a store that never answers fails
    /// the test instead of hanging it.
    @discardableResult
    func startAndAwaitFirstAnswer() async -> (Task<Void, Never>, InventoryDashboard?) {
        let task = Task { await observe() }
        for _ in 0..<1_000 where phase == .loading {
            await Task.yield()
        }
        return (task, dashboard)
    }

    /// Waits until `condition` holds against the latest answer, within the
    /// same bound.
    func awaitDashboard(where condition: (InventoryDashboard) -> Bool) async -> InventoryDashboard?
    {
        for _ in 0..<1_000 {
            if let dashboard, condition(dashboard) { return dashboard }
            await Task.yield()
        }
        return nil
    }
}
