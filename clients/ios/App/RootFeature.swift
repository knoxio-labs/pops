import AppCore
import FeatureTransactions

/// The features this binary can draw, and the order to fall back to before the
/// BFM has said anything.
///
/// This is the one list that is legitimately compiled in, and the distinction
/// matters: it is a list of **screens that exist in this build**, not of what
/// the federation contains. The app cannot render a feature it has no code
/// for — no amount of server-driven configuration changes that — and it is not
/// allowed to decide that a feature it *can* render is therefore available.
/// `GET /mobile/bootstrap` decides that, every launch.
///
/// The consequence in both directions:
///
/// - A feature the BFM names that is absent here is skipped in silence. An
///   older build meets a newer federation and shows what it knows how to show.
/// - A feature present here that the BFM does not name is not shown. A newer
///   build meets a pillar that has gone away and says so.
internal enum RootFeature {
    internal static let renderable: [MobileFeature] = [FeatureTransactions.feature]
}
