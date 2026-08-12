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
/// continuations parks forever when the code under test sends fewer requests
/// than the test expected — which turns a defect into a hung suite rather than
/// a failed assertion. The yield loop below cannot do that.
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
    private var arrived = 0

    /// `true` when some caller ran out of yields before everyone arrived, so
    /// the release was not the one the test was waiting for.
    private(set) var gaveUpWaiting = false

    internal init(count: Int) {
        self.count = count
    }

    internal func arriveAndWait() async {
        arrived += 1
        for _ in 0..<10_000 {
            if arrived >= count { return }
            await Task.yield()
        }
        gaveUpWaiting = true
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

    /// Whether anything has reached ``wait()``.
    ///
    /// The only sound thing for a test to synchronise on before it perturbs the
    /// code under test. Waiting on some *earlier* observable — a call count a
    /// step or two upstream — leaves every statement between that step and this
    /// one inside the race window, and a test that does it is a test that fails
    /// on whichever machine is slowest that day.
    ///
    /// A `Bool` rather than a continuation because it only ever goes one way,
    /// and `waitUntil` is already a polling loop.
    private(set) var hasParked = false

    internal func open() {
        isOpen = true
        for continuation in waiting { continuation.resume() }
        waiting.removeAll()
    }

    internal func wait() async {
        hasParked = true
        guard !isOpen else { return }
        await withCheckedContinuation { waiting.append($0) }
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
/// ``waitForReads(atLeast:)`` resumes a continuation the instant the target
/// count is reached, rather than polling `readCount` in a bounded loop. A
/// bounded poll is a proxy for "the other tasks got enough scheduling turns
/// to make that many reads", and that proxy fails under real CPU starvation —
/// a lint job saturating the runner's cores alongside this suite is a
/// documented case, in `ios-quality.yml`'s note on `mise run -j 1`. This type
/// makes the wait exact instead: a starved run is slower, never wrong.
///
/// Synchronous apart from the wait, because ``TokenStore`` is: an actor could
/// not witness `load()`.
internal final class CountingTokenStore: TokenStore {
    private typealias Continuation = CheckedContinuation<Void, any Error>

    private struct Waiter {
        let target: Int
        let continuation: Continuation
    }

    private struct State {
        var count = 0
        var nextWaiterID = 0
        // An id sits here from the moment `waitForReads` is called until its
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

    private let wrapped: any TokenStore
    private let state = Mutex<State>(State())

    internal init(_ wrapped: any TokenStore) {
        self.wrapped = wrapped
    }

    internal func load() throws -> DeviceTokens? {
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
        return try wrapped.load()
    }

    internal func save(_ tokens: DeviceTokens) throws {
        try wrapped.save(tokens)
    }

    internal func wipe() throws {
        try wrapped.wipe()
    }

    /// Suspends until at least `target` reads have happened, or throws
    /// ``CancellationError`` if the calling task is cancelled first — which is
    /// what lets ``withDeadline(seconds:_:)`` actually end this wait on a
    /// regression instead of leaving it parked past the deadline.
    ///
    /// Resumed synchronously from inside `load()` the moment the count
    /// reaches `target` — including immediately, if it already has by the
    /// time this is called — so there is no window in which a caller could
    /// miss the signal by arriving late.
    internal func waitForReads(atLeast target: Int) async throws {
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

/// Fails fast instead of hanging when `operation` never completes.
///
/// Every wait in this file that proves concurrency is signalled exactly —
/// ``Gate/wait()``, ``CountingTokenStore/waitForReads(atLeast:)`` — so a
/// correct implementation resolves in milliseconds. `seconds` only needs to
/// be far past that: it exists to turn "the implementation regressed and the
/// signal this was waiting for never came" into a fast, clear failure instead
/// of a suite that hangs until CI kills the job — the same failure mode
/// ``Barrier``'s own bound exists to avoid (see its doc comment).
///
/// A `Task.sleep` racing the real wait, not a test-level time limit trait:
/// that a trait cancels the test's task is not, by itself, enough — the
/// operation still has to *notice* the cancellation to stop waiting, which
/// only holds if every primitive it calls is itself cancellation-aware. That
/// held for ``CountingTokenStore/waitForReads(atLeast:)`` only after fixing
/// it to be so; racing here keeps the requirement local to this function
/// instead of resting on every current and future caller getting it right,
/// and does not depend on a trait actually being honoured by whatever
/// toolchain runs the suite.
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

/// Yields until `condition` holds, and reports whether it ever did.
///
/// Cooperative yielding rather than a sleep: the tasks this is waiting on run
/// on the same executor, so yielding is what lets them run — and the wait ends
/// the instant the condition holds rather than after a duration somebody
/// guessed. The bound exists so a regression fails the suite instead of hanging
/// it.
///
/// It is not a wall-clock timeout, but the bound is still a bet on how many
/// scheduling turns this suite's tasks get before it is exhausted — a bet
/// that loses under real CPU starvation, not just a slow machine: see
/// `ios-quality.yml`'s note on `mise run -j 1` for a documented case. Prefer
/// a primitive that is signalled exactly, like
/// ``CountingTokenStore/waitForReads(atLeast:)``, over adding a new caller
/// here where the condition can be made exact instead of merely observed.
///
/// It **returns** rather than throwing, and the difference is not stylistic.
/// Every caller has a gate to open afterwards, and a throw would skip it —
/// leaving the tasks this was waiting on parked forever on a gate nobody will
/// open, so a broken implementation would hang the suite instead of failing it.
/// That was not hypothetical: it is how the first version of these tests
/// behaved the first time the code under them was deliberately broken. Open the
/// gate unconditionally, then assert on the result.
@discardableResult
internal func waitUntil(
    _ waitingFor: String,
    _ condition: @Sendable () async -> Bool
) async -> Bool {
    for _ in 0..<10_000 {
        if await condition() { return true }
        await Task.yield()
    }
    return false
}
