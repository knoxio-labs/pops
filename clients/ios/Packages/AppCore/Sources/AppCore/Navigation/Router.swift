import SwiftUI

/// The observable navigation path a `NavigationStack` is driven from.
@MainActor
@Observable
public final class Router {
    public private(set) var path: [Route]

    public init(path: [Route] = []) {
        self.path = path
    }

    public func send(_ action: NavigationAction) {
        path = NavigationReducer.reduce(path, applying: action)
    }

    /// `NavigationStack` writes the path back when the user swipes or taps
    /// back, so it needs a writable binding. Routing those writes through
    /// ``send(_:)`` keeps the reducer the only thing that mutates the path.
    public var stackPath: Binding<[Route]> {
        Binding(get: { self.path }, set: { self.send(.replace($0)) })
    }
}
