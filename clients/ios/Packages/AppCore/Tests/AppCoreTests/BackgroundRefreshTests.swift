import AppCore
import Foundation
import Synchronization
import Testing

/// Records every refresh request, and refuses them when told to.
private final class RecordingScheduler: BackgroundRefreshScheduler {
    private let state = Mutex<(requests: [(String, Date)], refuses: Bool)>(([], false))

    var requests: [(identifier: String, earliestBeginDate: Date)] {
        state.withLock { $0.requests.map { ($0.0, $0.1) } }
    }

    func refuse() {
        state.withLock { $0.refuses = true }
    }

    func submitRefresh(identifier: String, earliestBeginDate: Date) throws {
        try state.withLock { state in
            if state.refuses { throw CocoaError(.featureUnsupported) }
            state.requests.append((identifier, earliestBeginDate))
        }
    }
}

/// Whether a piece of work started, finished, or saw its cancellation.
private final class WorkLog: Sendable {
    private let events = Mutex<[String]>([])
    let started: AsyncStream<Void>
    private let start: AsyncStream<Void>.Continuation

    init() {
        (started, start) = AsyncStream.makeStream()
    }

    var all: [String] { events.withLock { $0 } }

    /// Work that runs until it is cancelled.
    func untilCancelled() -> @Sendable () async -> Void {
        { [self] in
            note("started")
            start.yield()
            do {
                try await Task.sleep(for: .seconds(3_600))
                note("finished")
            } catch {
                note("cancelled")
            }
        }
    }

    func note(_ event: String) {
        events.withLock { $0.append(event) }
    }
}

@Suite("Background refresh", .timeLimit(.minutes(1)))
internal struct BackgroundRefreshTests {
    private static let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

    private static let neverElapses: @Sendable (Duration) async throws -> Void = { _ in
        try await Task.sleep(for: .seconds(3_600))
    }

    private static func refresh(
        _ scheduler: RecordingScheduler, unlocked: Bool = true,
        sleep: @escaping @Sendable (Duration) async throws -> Void = neverElapses
    ) -> BackgroundRefresh {
        BackgroundRefresh(
            interval: 900, budget: .seconds(25), scheduler: scheduler,
            isUnlockedSinceBoot: { unlocked }, now: { now }, sleep: sleep)
    }

    @Test("a refresh runs the work to completion and schedules the next one")
    func completesAndReschedules() async {
        let scheduler = RecordingScheduler()
        let log = WorkLog()

        let outcome = await Self.refresh(scheduler).run { log.note("worked") }

        #expect(outcome == .completed)
        #expect(log.all == ["worked"])
        #expect(scheduler.requests.map(\.identifier) == [BackgroundRefresh.inventoryIdentifier])
        #expect(scheduler.requests.map(\.earliestBeginDate) == [Self.now.addingTimeInterval(900)])
    }

    @Test("before the first unlock nothing runs, and the next refresh is still scheduled")
    func nothingBeforeFirstUnlock() async {
        let scheduler = RecordingScheduler()
        let log = WorkLog()

        let outcome = await Self.refresh(scheduler, unlocked: false).run { log.note("worked") }

        #expect(outcome == .lockedSinceBoot)
        #expect(log.all.isEmpty)
        #expect(scheduler.requests.count == 1)
    }

    @Test("work still going at the budget is cancelled")
    func budgetCancelsTheWork() async {
        let scheduler = RecordingScheduler()
        let log = WorkLog()
        let budgets = Mutex<[Duration]>([])
        let refresh = Self.refresh(scheduler) { budget in
            budgets.withLock { $0.append(budget) }
            for await _ in log.started { break }
        }

        let outcome = await refresh.run(log.untilCancelled())

        #expect(outcome == .ranOutOfTime)
        #expect(budgets.withLock { $0 } == [.seconds(25)])
        #expect(log.all == ["started", "cancelled"])
    }

    @Test("the system expiring the task cancels the work, and the run returns")
    func expirationCancelsCleanly() async {
        let scheduler = RecordingScheduler()
        let log = WorkLog()
        let refresh = Self.refresh(scheduler)
        let running = Task { await refresh.run(log.untilCancelled()) }
        for await _ in log.started { break }

        running.cancel()

        #expect(await running.value == .expired)
        #expect(log.all == ["started", "cancelled"])
        #expect(scheduler.requests.count == 1)
    }

    @Test("a refused schedule does not stop the refresh from running")
    func refusedScheduleStillRuns() async {
        let scheduler = RecordingScheduler()
        scheduler.refuse()
        let log = WorkLog()
        let refresh = Self.refresh(scheduler)

        #expect(!refresh.schedule())
        #expect(await refresh.run { log.note("worked") } == .completed)
        #expect(log.all == ["worked"])
    }
}

@Suite("First unlock probe")
internal struct FirstUnlockProbeTests {
    @Test("reads as locked until the marker is written, then as unlocked")
    func markerDecides() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "FirstUnlockProbeTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let probe = FirstUnlockProbe(directory: directory)

        #expect(!probe.isUnlockedSinceBoot)
        try probe.markUnlocked()
        #expect(probe.isUnlockedSinceBoot)
        #expect(FirstUnlockProbe(directory: directory).isUnlockedSinceBoot)
    }
}
