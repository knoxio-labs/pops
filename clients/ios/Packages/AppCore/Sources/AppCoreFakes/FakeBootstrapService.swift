import AppCore
import Foundation

/// Tracks a monotonically increasing count and holds the waiters registered
/// against it, so a caller can be resumed the instant ``record()`` reaches
/// their target rather than polled for.
///
/// Deliberately has no `async` method of its own. `FakeBootstrapService`
/// calls into this type from inside its own actor-isolated methods, and a
/// non-`Sendable` class's `async` method called from an actor is itself a
/// hop off that actor's isolation under Swift 6's strict-concurrency
/// checking (`sending 'self.calls' risks causing data races`) — so the
/// `withCheckedContinuation` that turns a count into a suspension point lives
/// in `FakeBootstrapService` itself, actor-isolated throughout, and this type
/// only ever does synchronous bookkeeping. See `Countdown` in
/// `clients/ios/Packages/Auth/Tests/AuthTests/ConcurrencyProbes.swift` for
/// the shape this took before that constraint was worked around — built to
/// be `Sendable` and callable from outside a single actor, which needs a
/// lock this file has no reason to pay for.
private final class CountSignal {
    private(set) var count = 0
    private var waiters: [(target: Int, continuation: CheckedContinuation<Void, Never>)] = []

    func record() {
        count += 1
        let ready = waiters.filter { $0.target <= count }
        waiters.removeAll { $0.target <= count }
        for waiter in ready { waiter.continuation.resume() }
    }

    /// Registers `continuation` to resume once `count` reaches `target`, or
    /// resumes it immediately if that is already true. The caller is always
    /// an actor-isolated `withCheckedContinuation` body — see this type's
    /// doc comment for why the suspension itself is not owned here.
    func registerOrResume(target: Int, continuation: CheckedContinuation<Void, Never>) {
        if count >= target {
            continuation.resume()
        } else {
            waiters.append((target, continuation))
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
    public func waitUntilCalled() async {
        await withCheckedContinuation { calls.registerOrResume(target: 1, continuation: $0) }
    }

    /// Parks until at least `target` calls to ``bootstrap()`` have returned or
    /// thrown — the "call finished" counterpart to ``waitUntilCalled()``'s
    /// "call started". Lets a test wait for a fire-and-forget retry it holds
    /// no handle to (e.g. ``AppShellModel/noteReachable()``) without polling
    /// the effect that retry is expected to have.
    public func waitForCompletions(atLeast target: Int) async {
        await withCheckedContinuation {
            completions.registerOrResume(target: target, continuation: $0)
        }
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
