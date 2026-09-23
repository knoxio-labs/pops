import Foundation
import Network
import Synchronization

/// Whether the current network path is usable, and when that changes.
/// ``NetworkPathReachability`` is the live implementation; tests script their own.
public protocol NetworkReachability: Sendable {
    /// The path's state right now.
    var isSatisfied: Bool { get }

    /// ``isSatisfied`` when the stream is made, followed by every change.
    /// Each call returns an independent stream.
    func updates() -> AsyncStream<Bool>
}

/// ``NetworkReachability`` backed by `NWPathMonitor`.
///
/// Until the monitor reports its first path, the network is assumed usable:
/// an attempted request can report failure, while assuming the opposite would
/// hold every network-backed feature until the first report.
public final class NetworkPathReachability: NetworkReachability {
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
        monitor.start(queue: DispatchQueue(label: "pops.network.reachability"))
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
