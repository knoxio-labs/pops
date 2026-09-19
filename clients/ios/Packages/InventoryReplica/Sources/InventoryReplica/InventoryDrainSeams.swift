import Foundation
import Network
import Synchronization

/// Whether the network path the drain would send over is usable, and when
/// that changes (ADR-002 D11: the drain runs on a path change to satisfied).
/// `NetworkPathReachability` is the real one; tests script their own.
public protocol InventoryReachability: Sendable {
    /// The path's state right now. The drain does not try to send while this
    /// is false.
    var isSatisfied: Bool { get }

    /// ``isSatisfied`` as it stands when the stream is made, then every
    /// change of it as it happens. Each call returns a stream of its own.
    func updates() -> AsyncStream<Bool>
}

/// How the drain waits out its backoff. `SystemDrainClock` really sleeps;
/// tests decide when a sleep ends.
public protocol InventoryDrainClock: Sendable {
    /// Returns after `duration`, or throws `CancellationError` if the task
    /// is cancelled first.
    func sleep(for duration: Duration) async throws
}

/// ``InventoryDrainClock`` over `ContinuousClock`, which keeps counting
/// while the device sleeps.
public struct SystemDrainClock: InventoryDrainClock {
    public init() {}

    public func sleep(for duration: Duration) async throws {
        try await ContinuousClock().sleep(for: duration)
    }
}

/// ``InventoryReachability`` over `NWPathMonitor`. Until the monitor reports
/// its first path the network is assumed usable: a send that fails only
/// costs a backoff, while assuming the opposite would hold every change back
/// until the first report.
public final class NetworkPathReachability: InventoryReachability {
    private struct State {
        var isSatisfied = true
        var listeners: [UUID: AsyncStream<Bool>.Continuation] = [:]
    }

    private let monitor = NWPathMonitor()
    private let state = Mutex(State())

    public init() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let satisfied = path.status == .satisfied
            let listeners = self.state.withLock { state in
                state.isSatisfied = satisfied
                return Array(state.listeners.values)
            }
            for listener in listeners { listener.yield(satisfied) }
        }
        monitor.start(queue: DispatchQueue(label: "inventory.drain.reachability"))
    }

    deinit {
        monitor.cancel()
    }

    public var isSatisfied: Bool { state.withLock { $0.isSatisfied } }

    public func updates() -> AsyncStream<Bool> {
        let (stream, continuation) = AsyncStream<Bool>.makeStream()
        let id = UUID()
        let current = state.withLock { state in
            state.listeners[id] = continuation
            return state.isSatisfied
        }
        continuation.yield(current)
        continuation.onTermination = { [weak self] _ in
            self?.state.withLock { _ = $0.listeners.removeValue(forKey: id) }
        }
        return stream
    }
}
