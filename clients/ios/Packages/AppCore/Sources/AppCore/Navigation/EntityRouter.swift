/// What routing a parsed ``PopsURI`` produced.
///
/// ``unsupported`` is not a failure: the URI parsed cleanly, but no feature
/// has registered a handler for its `(pillar, type)` pair — most often
/// because the code names a pillar or type this build never drew a screen
/// for. It is shown as a one-line hand-off to the owning pillar, not as an
/// error state.
public enum EntityRouteOutcome: Equatable, Sendable {
    case handled
    case unsupported(pillar: String)
}

/// Maps a parsed ``PopsURI`` to whichever feature claims its `(pillar, type)`
/// pair.
///
/// Only the composition root may know about more than one feature — the same
/// rule ``Route`` documents for in-app navigation — so this seam lives in
/// `AppCore` and is registered from the app target. A feature registers only
/// the pairs it can resolve; it never asks the router what else is
/// registered, and it never sees another feature's handler.
///
/// The scanner and the `pops` URL scheme (`onOpenURL`) both resolve through
/// the same router, so a label opens the same destination whichever path
/// found it.
@MainActor
public protocol EntityRouter: AnyObject {
    /// Registers the handler for one `(pillar, type)` pair. Registering the
    /// same pair again replaces the previous handler — the last registration
    /// wins, which matters only in tests, since production registers each
    /// pair once at startup.
    func register(pillar: String, type: String, handler: @escaping (PopsURI) -> Void)

    /// Resolves `uri` against the registered handlers.
    func route(_ uri: PopsURI) -> EntityRouteOutcome
}

/// The default ``EntityRouter``: a plain map from `(pillar, type)` to a
/// handler.
///
/// Nothing about dispatching a parsed reference to a registered closure is
/// app-specific, so the composition root instantiates one of these rather
/// than writing its own every time a feature needs registering.
@MainActor
public final class EntityRouterRegistry: EntityRouter {
    private struct Key: Hashable {
        let pillar: String
        let type: String
    }

    private var handlers: [Key: (PopsURI) -> Void] = [:]

    public init() {}

    public func register(pillar: String, type: String, handler: @escaping (PopsURI) -> Void) {
        handlers[Key(pillar: pillar, type: type)] = handler
    }

    public func route(_ uri: PopsURI) -> EntityRouteOutcome {
        guard let handler = handlers[Key(pillar: uri.pillar, type: uri.type)] else {
            return .unsupported(pillar: uri.pillar)
        }
        handler(uri)
        return .handled
    }
}
