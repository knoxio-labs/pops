import Foundation

/// Asks the system to run a background refresh again later. The app binds
/// it to `BGTaskScheduler`; tests record the requests.
public protocol BackgroundRefreshScheduler: Sendable {
    /// Submits a refresh request no earlier than `earliestBeginDate`,
    /// replacing any pending one with the same identifier. May take an
    /// arbitrary time to return, so it is never awaited ahead of other work.
    func submitRefresh(identifier: String, earliestBeginDate: Date) async throws
}

/// How one background refresh ended.
public enum BackgroundRefreshOutcome: Equatable, Sendable {
    /// The work finished inside the budget.
    case completed
    /// The work was cut off at the budget.
    case ranOutOfTime
    /// The system took the time back first (the task was cancelled).
    case expired
    /// The phone has not been unlocked since it started, so nothing the
    /// work needs can be read: nothing ran.
    case lockedSinceBoot
}

/// One background refresh, as the system grants it (Inventory ADR-002 D11):
/// ask for the next one first, so a run cut short still has a successor;
/// do nothing before the first unlock after a restart; then run the work,
/// cancelling it at `budget` or when the system expires the task, whichever
/// comes first.
public struct BackgroundRefresh: Sendable {
    /// The Inventory refresh's identifier, which the app's `Info.plist`
    /// must list under `BGTaskSchedulerPermittedIdentifiers`.
    public static let inventoryIdentifier = "com.knoxiolabs.pops.inventory.refresh"

    private let identifier: String
    private let interval: TimeInterval
    private let budget: Duration
    private let scheduler: any BackgroundRefreshScheduler
    private let isUnlockedSinceBoot: @Sendable () -> Bool
    private let now: @Sendable () -> Date
    private let sleep: @Sendable (Duration) async throws -> Void

    /// - Parameters:
    ///   - interval: How long after now the next refresh may begin. The
    ///     system decides when it actually runs.
    ///   - budget: How long the work may run. The system grants an app
    ///     refresh about 30 seconds; stopping short of that leaves time to
    ///     finish cleanly.
    ///   - isUnlockedSinceBoot: Whether data protected until first unlock
    ///     can be read.
    ///   - sleep: Waits out the budget; throws when cancelled.
    public init(
        identifier: String = BackgroundRefresh.inventoryIdentifier,
        interval: TimeInterval = 15 * 60,
        budget: Duration = .seconds(25),
        scheduler: any BackgroundRefreshScheduler,
        isUnlockedSinceBoot: @escaping @Sendable () -> Bool,
        now: @escaping @Sendable () -> Date = { Date() },
        sleep: @escaping @Sendable (Duration) async throws -> Void = {
            try await ContinuousClock().sleep(for: $0)
        }
    ) {
        self.identifier = identifier
        self.interval = interval
        self.budget = budget
        self.scheduler = scheduler
        self.isUnlockedSinceBoot = isUnlockedSinceBoot
        self.now = now
        self.sleep = sleep
    }

    /// Requests the next refresh `interval` from now.
    ///
    /// - Returns: False when the system refused the request (background
    ///   refresh turned off, or too many pending); the next foreground or
    ///   refresh asks again.
    @discardableResult
    public func schedule() async -> Bool {
        do {
            try await scheduler.submitRefresh(
                identifier: identifier, earliestBeginDate: now().addingTimeInterval(interval))
            return true
        } catch {
            return false
        }
    }

    /// Runs one refresh: asks for the next one, checks the phone has been
    /// unlocked since it started, then runs `work` inside the budget. The
    /// request is in flight alongside the work rather than ahead of it,
    /// because the system can take an arbitrary time to accept it. `work` is
    /// cancelled when the budget runs out or the calling task is cancelled,
    /// and this returns once it has stopped and the request has been answered.
    public func run(_ work: @escaping @Sendable () async -> Void) async -> BackgroundRefreshOutcome
    {
        async let rescheduled = schedule()
        let outcome = await runWithinBudget(work)
        _ = await rescheduled
        return outcome
    }

    private func runWithinBudget(
        _ work: @escaping @Sendable () async -> Void
    ) async -> BackgroundRefreshOutcome {
        guard isUnlockedSinceBoot() else { return .lockedSinceBoot }
        let outcome = await withTaskGroup(of: BackgroundRefreshOutcome?.self) { group in
            group.addTask {
                await work()
                return .completed
            }
            group.addTask { [sleep, budget] in
                do {
                    try await sleep(budget)
                } catch {
                    return nil
                }
                return .ranOutOfTime
            }
            let first = await group.next()
            group.cancelAll()
            return first.flatMap(\.self)
        }
        if Task.isCancelled { return .expired }
        return outcome ?? .expired
    }
}
