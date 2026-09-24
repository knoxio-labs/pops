import Foundation

/// Runs ``InventoryStore/syncNow()`` at most once at a time and no more than
/// once per `freshness` window: a call while one is already running joins it
/// rather than starting a second, and a call within `freshness` of the last
/// one finishing does nothing at all. What a screen that wants Inventory
/// current every time it appears — the dashboard, opened and left and opened
/// again — asks through, so switching back to it does not ask the store to
/// sync itself over and over.
@MainActor
public final class CoalescedInventorySync {
    private let store: any InventoryStore
    private let freshness: TimeInterval
    private let now: @Sendable () -> Date
    private var inFlight: Task<Void, Never>?
    private var completedAt: Date?

    /// - Parameters:
    ///   - freshness: How long a completed sync is still considered current.
    ///   - now: The clock `freshness` is measured against.
    public init(
        store: any InventoryStore, freshness: TimeInterval = 30,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.store = store
        self.freshness = freshness
        self.now = now
    }

    /// Syncs, joining a sync already running rather than starting a second
    /// one, and doing nothing within ``freshness`` of the last one that
    /// finished.
    public func run() async {
        if let inFlight {
            await inFlight.value
            return
        }
        if let completedAt, now().timeIntervalSince(completedAt) < freshness {
            return
        }
        let task = Task { [store] in await store.syncNow() }
        inFlight = task
        await task.value
        inFlight = nil
        completedAt = now()
    }
}
