import Foundation
import Synchronization

/// Who is watching the replica, told after every committed write.
///
/// Deliveries are serialised by one lock. Each one re-reads the replica, so
/// two writers notifying at once could otherwise interleave a read taken
/// before the second write with a yield made after it, leaving an observer on
/// a stale value as its last. Serialised, whichever delivery runs last read
/// the newest state.
internal final class ReplicaObservers: Sendable {
    private let handlers = Mutex<[UUID: @Sendable () -> Void]>([:])
    private let delivery = Mutex(())

    /// Registers `handler` and runs it once straight away, under the same
    /// lock a notification takes, so the first value cannot overtake a newer
    /// one.
    func add(_ id: UUID, _ handler: @escaping @Sendable () -> Void) {
        handlers.withLock { $0[id] = handler }
        delivery.withLock { _ in handler() }
    }

    func remove(_ id: UUID) {
        _ = handlers.withLock { $0.removeValue(forKey: id) }
    }

    func notify() {
        let current = handlers.withLock { Array($0.values) }
        delivery.withLock { _ in
            for handler in current { handler() }
        }
    }
}
