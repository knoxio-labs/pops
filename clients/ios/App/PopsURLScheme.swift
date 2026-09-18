import AppCore
import Foundation

/// Resolves a URL opened through the app's `pops` URL scheme against
/// ``EntityRouter``, the same seam the QR scanner resolves a scanned code
/// through — a label opens the same destination whichever path found it.
///
/// A URL that is not a well-formed `pops://<pillar>/<type>/<id>` reference is
/// silently ignored rather than routed as a hand-off: it never parsed as a
/// `PopsURI` at all, so there is no pillar to hand off to. That case returns
/// `nil` rather than ``EntityRouteOutcome/handled``, which would claim a
/// screen changed when none did.
///
/// The outcome is returned rather than discarded so the caller can surface
/// ``EntityRouteOutcome/unsupported(pillar:)`` to whoever opened the link —
/// a code this build cannot show should say so, not silently do nothing.
@MainActor
internal func handleOpenPopsURL(_ url: URL, router: EntityRouter) -> EntityRouteOutcome? {
    guard let uri = parsePopsURI(url.absoluteString) else { return nil }
    return router.route(uri)
}
