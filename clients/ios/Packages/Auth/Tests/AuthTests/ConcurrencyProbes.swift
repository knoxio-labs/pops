import Auth
import Synchronization

/// Releases every waiter only once `count` of them have arrived.
///
/// The subject of this package's concurrency suites is what happens when N
/// callers hold a rejected token *at the same time*. Without a barrier a
/// scheduler that happened to run them one after another would exercise the
/// "a refresh already finished" path instead, and the assertion would pass for
/// a reason that has nothing to do with what it claims to prove.
///
/// Bounded, and releases itself when the bound is reached. A barrier built on
/// a continuation with no bound at all parks forever when the code under test
/// sends fewer requests than the test expected — turning a defect into a hung
/// suite rather than a failed assertion. So the release races a wall-clock
/// deadline instead: not a fixed count of `Task.yield()`s, which is a bet that
/// every other waiter got enough scheduling turns to arrive, and a bet that
/// loses under real CPU starvation — the same failure mode
/// ``withDeadline(seconds:_:)`` exists to avoid, and for the same reason. A
/// wall-clock bound degrades gracefully under starvation instead of running
/// out early on a turn count: a starved run gives up later, never wrongly.
///
/// But releasing anyway means the barrier can **fail open**: every caller
/// returns, the suite proceeds, and the concurrency the test claims to have
/// established never happened. That is worse than a hang, because the test
/// still passes — and it would pass for the single-flight suites in particular,
/// whose assertion also holds when callers arrive one at a time. So giving up
/// is recorded, and every test that uses one asserts on it. A probe that can
/// quietly stop probing is the thing these suites exist to rule out.
internal actor Barrier {
    private let count: Int
    private let seconds: Double
    private var arrived = 0
    private var released = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var watchdog: Task<Void, Never>?

    /// `true` when the deadline elapsed before everyone arrived, so the
    /// release was not the one the test was waiting for.
    private(set) var gaveUpWaiting = false

    internal init(count: Int, seconds: Double = 30) {
        self.count = count
        self.seconds = seconds
    }

    internal func arriveAndWait() async {
        arrived += 1
        if arrived >= count {
            release()
            return
        }
        armWatchdog()
        guard !released else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    /// Starts the one deadline this barrier ever runs, on the first arrival
    /// that finds the barrier not yet satisfied. Idempotent, so the other
    /// `count - 1` arrivals do not each start their own.
    private func armWatchdog() {
        guard watchdog == nil else { return }
        watchdog = Task { [weak self, seconds] in
            try? await Task.sleep(for: .seconds(seconds))
            await self?.giveUp()
        }
    }

    private func giveUp() {
        guard !released else { return }
        gaveUpWaiting = true
        release()
    }

    private func release() {
        guard !released else { return }
        released = true
        watchdog?.cancel()
        for continuation in waiters { continuation.resume() }
        waiters.removeAll()
    }
}

/// Lets a test wait for at least `target` occurrences of an event to have
/// happened, signalled the instant the target is reached rather than polled
/// for.
///
/// Every probe in this file that needs "wait for N somethings to happen"
/// rather than "wait for a single one-way flag" shares this shape:
/// ``CountingTokenStore`` counts `TokenStore/load()` calls, ``Gate`` counts
/// arrivals at `wait()`, and `RecordingTransport` (in
/// `RecordingTransport.swift`) counts arrivals at the transport. `record()`
/// is synchronous and lock-based rather than actor-isolated because every one
/// of those call sites either is itself synchronous (`load()`) or must record
/// atomically with a decision the caller makes immediately afterward
/// (``Gate/wait()``'s `isOpen` check) rather than a moment before it — an
/// actor can only guarantee that atomicity for its own state, and the whole
/// point here is a plain lock any of these types can share.
///
/// ``wait(atLeast:)`` resumes a continuation the instant the target count is
/// reached, rather than polling a count in a bounded loop. A bounded poll is
/// a proxy for "the other tasks got enough scheduling turns to make that many
/// events happen", and that proxy fails under real CPU starvation — a lint
/// job saturating the runner's cores alongside this suite is a documented
/// case, in `ios-quality.yml`'s note on `mise run -j 1`. This type makes the
/// wait exact instead: a starved run is slower, never wrong. It is also
/// cancellation-aware, which is what lets ``withDeadline(seconds:_:)`` turn a
/// target that is never reached into a fast, clear failure instead of a hang.
///
/// Only a test's own orchestration ever calls `wait(atLeast:)` — never the
/// code under test — so, unlike ``Barrier``, there is nothing here to fail
/// open about: a target that is never reached fails the calling test via the
/// deadline, it does not strand a caller the implementation itself is
/// blocking on.
internal final class Countdown: Sendable {
    private typealias Continuation = CheckedContinuation<Void, any Error>

    private struct Waiter {
        let target: Int
        let continuation: Continuation
    }

    private struct State {
        var count = 0
        var nextWaiterID = 0
        // An id sits here from the moment `wait(atLeast:)` is called until its
        // outcome is decided one way or another. Registered *before* the
        // continuation exists, so `onCancel` — which can run concurrently with,
        // or even before, the code below that creates the continuation — always
        // has something to claim. Without this, a cancellation that lands in
        // that gap would find no waiter to resume and the continuation
        // registered a moment later would then wait for a signal that already
        // happened and is never coming again.
        var pendingIDs: Set<Int> = []
        var waiters: [Int: Waiter] = [:]
    }

    private let state = Mutex<State>(State())

    internal init() {}

    /// Records one occurrence of the event, resuming any waiter whose target
    /// is now met.
    internal func record() {
        let ready: [Waiter] = state.withLock { state in
            state.count += 1
            let count = state.count
            let readyIDs = state.waiters.filter { $0.value.target <= count }.map(\.key)
            var ready: [Waiter] = []
            for id in readyIDs {
                state.pendingIDs.remove(id)
                if let waiter = state.waiters.removeValue(forKey: id) { ready.append(waiter) }
            }
            return ready
        }
        for waiter in ready { waiter.continuation.resume() }
    }

    /// Suspends until at least `target` occurrences have been recorded, or
    /// throws ``CancellationError`` if the calling task is cancelled first.
    ///
    /// Resumed synchronously from inside `record()` the moment the count
    /// reaches `target` — including immediately, if it already has by the
    /// time this is called — so there is no window in which a caller could
    /// miss the signal by arriving late.
    internal func wait(atLeast target: Int) async throws {
        let id = state.withLock { state -> Int in
            let id = state.nextWaiterID
            state.nextWaiterID += 1
            state.pendingIDs.insert(id)
            return id
        }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: Continuation) in
                let outcome: Result<Void, any Error>? = state.withLock { state in
                    guard state.pendingIDs.contains(id) else {
                        return .failure(CancellationError())
                    }
                    if state.count >= target {
                        state.pendingIDs.remove(id)
                        return .success(())
                    }
                    state.waiters[id] = Waiter(target: target, continuation: continuation)
                    return nil
                }
                if let outcome { continuation.resume(with: outcome) }
            }
        } onCancel: {
            let waiter: Waiter? = state.withLock { state in
                state.pendingIDs.remove(id)
                return state.waiters.removeValue(forKey: id)
            }
            waiter?.continuation.resume(throwing: CancellationError())
        }
    }
}

/// A one-way switch a test flips when it is ready.
///
/// Used to hold a refresh open for as long as it takes every other caller to
/// pile up behind it — the state the single-flight logic exists for, and the
/// one a test cannot otherwise be sure it reached.
internal actor Gate {
    private var isOpen = false
    private var waiting: [CheckedContinuation<Void, Never>] = []
    private let arrivals = Countdown()

    internal func open() {
        isOpen = true
        for continuation in waiting { continuation.resume() }
        waiting.removeAll()
    }

    internal func wait() async {
        // Recorded first, before the `isOpen` check, and both are part of the
        // same non-suspending actor turn — so a caller of
        // ``waitForArrivals(atLeast:)`` that observes the record is
        // guaranteed this call has already reached (and, since nothing but
        // `open()` can flip `isOpen`, is about to act on) this exact point.
        // Recording it instead from outside, ahead of the `await wait()` call
        // that reaches here, would leave a real gap: the recording task could
        // be descheduled between recording and actually entering this method,
        // during which a test could call `open()` and have this call race
        // straight through without ever parking.
        arrivals.record()
        guard !isOpen else { return }
        await withCheckedContinuation { waiting.append($0) }
    }

    /// Suspends until `wait()` has been entered at least `target` times. See
    /// ``Countdown/wait(atLeast:)`` for how the wait is signalled.
    internal func waitForArrivals(atLeast target: Int) async throws {
        try await arrivals.wait(atLeast: target)
    }
}

/// A ``TokenStore`` that lets a test wait for a specific number of reads to
/// have happened, rather than poll for it.
///
/// The read count is the only externally visible proof that a caller has
/// entered `DeviceSessionRefresher` and got as far as looking at the stored
/// pair — every path through it reads the store exactly once before deciding
/// what to do. It is what turns "twenty callers were probably concurrent"
/// into "nineteen callers were parked when the twentieth rotation began".
///
/// Reads are counted through ``Countdown`` — see its doc comment for how the
/// wait is signalled and why it needs no fail-open case.
///
/// Synchronous apart from the wait, because ``TokenStore`` is: an actor could
/// not witness `load()`.
internal final class CountingTokenStore: TokenStore {
    private let wrapped: any TokenStore
    private let reads = Countdown()

    internal init(_ wrapped: any TokenStore) {
        self.wrapped = wrapped
    }

    internal func load() throws -> DeviceTokens? {
        reads.record()
        return try wrapped.load()
    }

    internal func save(_ tokens: DeviceTokens) throws {
        try wrapped.save(tokens)
    }

    internal func wipe() throws {
        try wrapped.wipe()
    }

    /// Suspends until at least `target` reads have happened. See
    /// ``Countdown/wait(atLeast:)``.
    internal func waitForReads(atLeast target: Int) async throws {
        try await reads.wait(atLeast: target)
    }
}

/// Fails fast instead of hanging when `operation` never completes.
///
/// Every wait in this file that proves concurrency is signalled exactly —
/// ``Gate/wait()``, ``Countdown/wait(atLeast:)`` — so a correct
/// implementation resolves in milliseconds. `seconds` only needs to be far
/// past that: it exists to turn "the implementation regressed and the signal
/// this was waiting for never came" into a fast, clear failure instead of a
/// suite that hangs until CI kills the job — the same failure mode
/// ``Barrier``'s own bound exists to avoid (see its doc comment).
///
/// A `Task.sleep` racing the real wait, not a test-level time limit trait:
/// that a trait cancels the test's task is not, by itself, enough — the
/// operation still has to *notice* the cancellation to stop waiting, which
/// only holds if every primitive it calls is itself cancellation-aware. That
/// held for ``Countdown/wait(atLeast:)`` only after building it to be so;
/// racing here keeps the requirement local to this function instead of
/// resting on every current and future caller getting it right, and does not
/// depend on a trait actually being honoured by whatever toolchain runs the
/// suite.
internal func withDeadline<T: Sendable>(
    seconds: Double = 30,
    _ operation: @Sendable @escaping () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(for: .seconds(seconds))
            throw DeadlineExceeded()
        }
        defer { group.cancelAll() }
        guard let result = try await group.next() else {
            // Unreachable: two tasks were just added above and this is the
            // first `next()` call, so at least one has a result to give.
            throw DeadlineExceeded()
        }
        return result
    }
}

internal struct DeadlineExceeded: Error, CustomStringConvertible {
    internal var description: String { "operation did not complete within the deadline" }
}
