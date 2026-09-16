/// One moment in the life of a phone that has been packing without signal.
///
/// Everything the sync screens draw comes from one of these, so a scenario the
/// ticket requires, relaunch, partial replay, storage full, is a value here
/// rather than a screen somewhere with its own idea of the story.
internal struct InventorySyncScene: Equatable {
    internal let title: String
    /// Nil before this phone has a catalogue at all, which is a different
    /// screen from an empty one.
    internal let minutesSinceSync: Int?
    internal let operations: [InventoryQueuedOperation]
    internal let conflicts: [InventoryConflict]
    internal let showsResolved: Bool

    internal init(
        title: String,
        minutesSinceSync: Int?,
        operations: [InventoryQueuedOperation] = [],
        conflicts: [InventoryConflict] = [],
        showsResolved: Bool = false
    ) {
        self.title = title
        self.minutesSinceSync = minutesSinceSync
        self.operations = operations
        self.conflicts = conflicts
        self.showsResolved = showsResolved
    }

    internal var isFirstRun: Bool { minutesSinceSync == nil }

    internal var pending: [InventoryQueuedOperation] {
        InventoryQueue.ordered(operations).filter { $0.progress != .done }
    }

    /// The repair that would interrupt somebody under a given rule, if any.
    internal func interrupting(
        under interruption: InventorySyncStyle.Interruption
    ) -> InventoryConflict? {
        conflicts.first { interruption.interrupts($0) }
    }

    /// What the dashboard's capsule would say about this moment. Reuses
    /// POPS-3981's decided type rather than inventing a second status vocabulary.
    internal var capsuleState: InventorySyncState {
        if !conflicts.isEmpty { return .needsAttention(count: conflicts.count) }
        if operations.contains(where: { $0.progress == .sending }) {
            let done = operations.filter { $0.progress == .done }.count
            return .synchronizing(progress: "\(done) of \(operations.count)")
        }
        guard let minutesSinceSync, !pending.isEmpty || minutesSinceSync >= 30 else {
            return .current
        }
        return .offline(updated: InventoryStaleness.age(minutesSinceSync: minutesSinceSync))
    }
}

/// The scenes POPS-3988 requires, as one afternoon told in order.
internal enum InventorySyncScenes {
    private typealias Fixtures = InventorySyncFixtures

    internal static let firstRun = InventorySyncScene(
        title: "Nothing here yet", minutesSinceSync: nil)

    internal static let offlineRead = InventorySyncScene(
        title: "Offline, nothing waiting", minutesSinceSync: 22)

    internal static let queued = InventorySyncScene(
        title: "Offline, six changes", minutesSinceSync: 95, operations: Fixtures.queued)

    internal static let relaunched = InventorySyncScene(
        title: "After a relaunch", minutesSinceSync: 26 * 60, operations: Fixtures.many)

    internal static let replaying = InventorySyncScene(
        title: "Reconnected, replaying", minutesSinceSync: 95,
        operations: Fixtures.replaying, conflicts: [Fixtures.concurrentEdit])

    internal static let repairs = InventorySyncScene(
        title: "Five repairs waiting", minutesSinceSync: 40,
        operations: Fixtures.replaying, conflicts: Fixtures.repairs, showsResolved: true)

    internal static let sessionExpired = InventorySyncScene(
        title: "Session expired", minutesSinceSync: 95,
        operations: Fixtures.queued, conflicts: [Fixtures.expiredSession])

    internal static let storageFull = InventorySyncScene(
        title: "Storage full", minutesSinceSync: 95,
        operations: Fixtures.queued, conflicts: [Fixtures.storageFull])

    internal static let appBehind = InventorySyncScene(
        title: "App behind the server", minutesSinceSync: 95,
        operations: Fixtures.queued, conflicts: [Fixtures.unsupportedContract])

    internal static let settled = InventorySyncScene(
        title: "Everything landed", minutesSinceSync: 1, showsResolved: true)
}
