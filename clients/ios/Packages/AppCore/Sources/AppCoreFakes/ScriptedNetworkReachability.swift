import AppCore
import Foundation
import Synchronization

/// A network path that tests change explicitly.
public final class ScriptedNetworkReachability: NetworkReachability {
    private struct State {
        var isSatisfied: Bool
        var listeners: [UUID: AsyncStream<Bool>.Continuation] = [:]
    }

    private let state: Mutex<State>

    /// Creates a path with the supplied current state.
    public init(satisfied: Bool) {
        state = Mutex(State(isSatisfied: satisfied))
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

    /// Publishes a new current state to every active stream.
    public func set(_ satisfied: Bool) {
        let listeners = state.withLock { state in
            state.isSatisfied = satisfied
            return Array(state.listeners.values)
        }
        for listener in listeners { listener.yield(satisfied) }
    }
}
