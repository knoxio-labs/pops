import AppCore
import Foundation

/// A ``BootstrapService`` that answers with whatever it was handed, and counts
/// how often it was asked.
public actor FakeBootstrapService: BootstrapService {
    public private(set) var callCount = 0

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
        callCount += 1
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
        while callCount == 0 { await Task.yield() }
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
