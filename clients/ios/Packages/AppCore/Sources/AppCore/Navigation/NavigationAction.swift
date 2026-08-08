/// The only ways a navigation path may change.
public enum NavigationAction: Hashable, Sendable {
    case push(Route)
    case pop
    case popToRoot
    /// Set the whole path, which is also how `NavigationStack` reports a
    /// swipe-back or a back-button tap.
    case replace([Route])
}

/// Path transitions as a pure function, so navigation is testable without a
/// view hierarchy. ``Router`` is the observable wrapper around it.
public enum NavigationReducer {
    /// - Returns: the path after applying `action`, unchanged where the action
    ///   does not apply.
    public static func reduce(_ path: [Route], applying action: NavigationAction) -> [Route] {
        switch action {
        case let .push(route):
            // A double tap delivers two pushes before the first frame renders.
            // Without this the user lands on two identical screens and has to
            // dismiss both to get back.
            guard path.last != route else { return path }
            return path + [route]
        case .pop:
            return path.isEmpty ? path : Array(path.dropLast())
        case .popToRoot:
            return []
        case let .replace(routes):
            return routes
        }
    }
}
