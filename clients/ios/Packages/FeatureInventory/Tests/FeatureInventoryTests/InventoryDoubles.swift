import AppCore
import Foundation
import Observation

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
    /// deadline so a store that never answers fails the test instead of
    /// hanging it.
    @discardableResult
    func startAndAwaitFirstAnswer() async -> (Task<Void, Never>, InventoryDashboard?) {
        let task = Task { await observe() }
        await waitUntilObserved { [self] in phase != .loading }
        return (task, dashboard)
    }

    /// Waits until `condition` holds against the latest answer, within the
    /// same deadline.
    func awaitDashboard(where condition: @escaping @Sendable (InventoryDashboard) -> Bool) async
        -> InventoryDashboard?
    {
        await waitUntilObserved { [self] in dashboard.map(condition) ?? false }
        return dashboard
    }

    /// Suspends until `predicate` holds, resumed by Observation the moment a
    /// tracked property changes rather than by polling, and bounded by a
    /// deadline rather than a scheduling-turn budget — the same shape
    /// `withDeadline` gives the Auth package's own concurrency probes, for
    /// the same reason: a scheduling-turn count is a proxy for progress that
    /// CPU starvation can make unsound, and a store that never answers must
    /// still let the test fail promptly instead of hanging the suite.
    @MainActor
    private func waitUntilObserved(
        deadline: Duration = .seconds(2), _ predicate: @escaping @Sendable @MainActor () -> Bool
    ) async {
        if predicate() { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let resumeOnce = ResumeOnce(continuation)
            trackUntilTrue(predicate, resuming: resumeOnce)
            Task {
                try? await Task.sleep(for: deadline)
                await resumeOnce.resume()
            }
        }
    }

    /// Re-registers Observation tracking each time it fires, until
    /// `predicate` holds, then resumes `resumeOnce`. A method rather than a
    /// nested closure: Swift refuses `@Sendable` on a main-actor-isolated
    /// local function, which a closure recursing into itself needs in order
    /// to be captured by the `Task { @MainActor in }` hop
    /// `withObservationTracking`'s `onChange` requires.
    @MainActor
    private func trackUntilTrue(
        _ predicate: @escaping @Sendable @MainActor () -> Bool,
        resuming resumeOnce: ResumeOnce
    ) {
        withObservationTracking {
            _ = predicate()
        } onChange: {
            Task { @MainActor in
                if predicate() {
                    await resumeOnce.resume()
                } else {
                    self.trackUntilTrue(predicate, resuming: resumeOnce)
                }
            }
        }
    }
}

/// Resumes a continuation exactly once, whichever of two independent
/// races — the awaited event firing, or the deadline elapsing — gets there
/// first. An actor rather than a lock: both races call in from `Task`s that
/// may run concurrently with each other.
private actor ResumeOnce {
    private var continuation: CheckedContinuation<Void, Never>?

    init(_ continuation: CheckedContinuation<Void, Never>) {
        self.continuation = continuation
    }

    func resume() {
        continuation?.resume()
        continuation = nil
    }
}
