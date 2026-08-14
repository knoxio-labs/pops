import AppCore
import Foundation
import Synchronization

/// Lets a caller wait for at least `target` occurrences of an event to have
/// happened, signalled the instant the target is reached rather than polled
/// for — and cancellation-aware, so a caller racing this against a deadline
/// (``AppShellReachabilityTests``'s `withDeadline`) can actually be released
/// when the deadline wins, rather than leaving `withTaskGroup` waiting
/// forever for a child task that `cancelAll()` marked cancelled but never
/// woke up.
///
/// A direct port of `Countdown` in
/// `clients/ios/Packages/Auth/Tests/AuthTests/ConcurrencyProbes.swift` — see
/// its doc comment for the full reasoning (the `pendingIDs` set covering the
/// register/cancel race, why `record()` returns waiters to resume rather
/// than resuming under the lock). `Mutex`-protected state is what makes this
/// safe to call from `onCancel`, which runs on whatever thread issued the
/// cancellation, not necessarily `FakeBootstrapService`'s own actor.
private final class CountSignal: @unchecked Sendable {
    private typealias Continuation = CheckedContinuation<Void, any Error>

    private struct Waiter {
        let target: Int
        let continuation: Continuation
    }

    private struct State {
        var count = 0
        var nextWaiterID = 0
        var pendingIDs: Set<Int> = []
        var waiters: [Int: Waiter] = [:]
    }

    private let state = Mutex<State>(State())

    var count: Int { state.withLock { $0.count } }

    func record() {
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
    /// throws `CancellationError` if the calling task is cancelled first —
    /// including a cancellation that arrives while this is still suspended,
    /// which is exactly what a losing `withDeadline` race delivers.
    func wait(atLeast target: Int) async throws {
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

/// A ``BootstrapService`` that answers with whatever it was handed, and counts
/// how often it was asked.
public actor FakeBootstrapService: BootstrapService {
    /// Calls that have *started* — incremented the instant ``bootstrap()`` is
    /// entered, before the result gate or the result itself is looked at. A
    /// call held open by ``suspendUntilReleased()`` still counts here, which
    /// is what makes ``waitUntilCalled()`` meaningful for a call the test
    /// intends to leave in flight.
    public var callCount: Int { calls.count }

    private let calls = CountSignal()
    private let completions = CountSignal()
    private var result: Result<BootstrapSnapshot, RepositoryError>
    private var gate: (stream: AsyncStream<Void>, continuation: AsyncStream<Void>.Continuation)?

    public init(result: Result<BootstrapSnapshot, RepositoryError> = .success(.fake())) {
        self.result = result
    }

    public func setResult(_ result: Result<BootstrapSnapshot, RepositoryError>) {
        self.result = result
    }

    /// Holds every call until ``release()``, so a test can assert what the app
    /// shows *while* bootstrap is in flight — which is the state the launch
    /// path is designed around and the one a call that returns instantly hides.
    public func suspendUntilReleased() {
        var continuation: AsyncStream<Void>.Continuation?
        let stream = AsyncStream<Void> { continuation = $0 }
        guard let continuation else { return }
        gate = (stream, continuation)
    }

    public func release() {
        gate?.continuation.finish()
        gate = nil
    }

    public func bootstrap() async throws -> BootstrapSnapshot {
        calls.record()
        defer { completions.record() }
        if let gate {
            for await _ in gate.stream {}
        }
        // A real client throws when the task around it is cancelled, and the
        // shell's handling of that is a branch worth reaching: without this the
        // gate would simply return a snapshot and no test could exercise it.
        try Task.checkCancellation()
        return try result.get()
    }

    /// Parks until the first call has reached ``bootstrap()``, so a test can
    /// cancel a request that is genuinely in flight rather than one that has
    /// not started.
    public func waitUntilCalled() async throws {
        try await calls.wait(atLeast: 1)
    }

    /// Parks until at least `target` calls to ``bootstrap()`` have returned or
    /// thrown — the "call finished" counterpart to ``waitUntilCalled()``'s
    /// "call started". Lets a test wait for a fire-and-forget retry it holds
    /// no handle to (e.g. ``AppShellModel/noteReachable()``) without polling
    /// the effect that retry is expected to have.
    public func waitForCompletions(atLeast target: Int) async throws {
        try await completions.wait(atLeast: target)
    }
}

/// A ``SessionRestoring`` that answers with whatever it was handed.
public struct FakeSessionRestorer: SessionRestoring {
    private let state: SessionState

    public init(_ state: SessionState = .unpaired) {
        self.state = state
    }

    public func restoredSession() async -> SessionState { state }
}

extension BootstrapSnapshot {
    public static func fake(
        device: BootstrapDevice = .fake(),
        registrySource: RegistrySource = .fresh,
        features: [FeatureAvailability] = [.fake()]
    ) -> BootstrapSnapshot {
        BootstrapSnapshot(
            device: device,
            registrySource: registrySource,
            features: features
        )
    }
}

extension BootstrapDevice {
    public static func fake(
        id: String = "device-fake",
        name: String = "Fake iPhone",
        lastSeenAt: Date = Date(timeIntervalSince1970: 0)
    ) -> BootstrapDevice {
        BootstrapDevice(id: id, name: name, lastSeenAt: lastSeenAt)
    }
}

extension FeatureAvailability {
    public static func fake(
        id: MobileFeature = .transactions,
        reachability: FeatureReachability = .healthy
    ) -> FeatureAvailability {
        FeatureAvailability(id: id, reachability: reachability)
    }
}
