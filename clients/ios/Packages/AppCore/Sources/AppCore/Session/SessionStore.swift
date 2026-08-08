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
