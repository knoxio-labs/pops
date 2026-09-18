import AppCore
import Foundation

/// Resolves a URL opened through the app's `pops` URL scheme against
/// ``EntityRouter``, the same seam the QR scanner resolves a scanned code
/// through — a label opens the same destination whichever path found it.
///
/// A URL that is not a well-formed `pops://<pillar>/<type>/<id>` reference is
/// silently ignored rather than routed as a hand-off: it never parsed as a
/// `PopsURI` at all, so there is no pillar to hand off to.
@MainActor
internal func handleOpenPopsURL(_ url: URL, router: EntityRouter) {
    guard let uri = parsePopsURI(url.absoluteString) else { return }
    _ = router.route(uri)
}
