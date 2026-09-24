import Observation

/// The observable session the root view switches on.
@MainActor
@Observable
public final class SessionStore {
    public private(set) var state: SessionState

    public init(state: SessionState = .unpaired) {
        self.state = state
    }

    public func send(_ event: SessionEvent) {
        state = SessionReducer.reduce(state, applying: event)
    }
}

/// The real sink. `SessionStore.send` is synchronous and main-actor-isolated,
/// which Swift accepts as the witness for an `async` requirement — the hop is
/// the `await` at the call site, and there is no second implementation to keep
/// in step with the first. Declared here rather than beside the protocol
/// because the conformance implies `Sendable`, which Swift 6.4 accepts only in
/// the class's own file.
extension SessionStore: SessionEventSink {}
