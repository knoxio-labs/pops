import AppCore
import FeatureAccounts
import FeatureEgo
import FeatureInventory
import FeaturePurchases
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
///
/// Listing a feature here is inert on its own — the BFM has to name it in
/// `GET /mobile/bootstrap` before anybody sees it — which is why a screen can
/// be registered here before the server is ready to offer it.
///
/// `.receiptCapture` is deliberately absent, even though `FeatureSurface`
/// still carries an answer about it (`captureAvailable`, read straight off
/// the BFM's snapshot by `AppShellModel`, independently of this list). POPS-
/// 4294 retired its tab; adding it back here would put it through the same
/// path for every renderable feature: it needs a screen and an entry in
/// `RootFeature.presentation` for its name and symbol (`RootCopyPresentationTests`
/// enforces that every entry has one). Receipt capture is not a screen;
/// Purchases reads `captureAvailable` to decide whether to offer capture inline.
internal enum RootFeature {
    internal static let renderable: [MobileFeature] = [
        FeatureTransactions.feature,
        FeatureAccounts.feature,
        FeaturePurchases.feature,
        FeatureInventory.feature,
        FeatureEgo.feature,
    ]

    /// What each renderable feature calls itself: its display name and symbol,
    /// as the feature module — not the shell — declares them. Some features
    /// use these in a tab; others, such as Ego, use them in a separate entry.
    ///
    /// Keyed here rather than switched on in `RootCopy`, so a feature that
    /// forgets to appear in this dictionary is the same mistake as forgetting
    /// to add it to `renderable` above: both are noticed the moment the
    /// feature is wired in, not rediscovered by whoever next edits the tab
    /// bar.
    ///
    /// Computed, not stored: a name is resolved in the reader's language when
    /// it is asked for, and a stored dictionary would keep whichever language
    /// the first reader happened to be in.
    internal static var presentation: [MobileFeature: FeaturePresentation] {
        [
            FeatureTransactions.feature: FeaturePresentation(
                displayName: FeatureTransactions.displayName,
                symbolName: FeatureTransactions.symbolName),
            FeatureAccounts.feature: FeaturePresentation(
                displayName: FeatureAccounts.displayName,
                symbolName: FeatureAccounts.symbolName),
            FeaturePurchases.feature: FeaturePresentation(
                displayName: FeaturePurchases.displayName,
                symbolName: FeaturePurchases.symbolName),
            FeatureInventory.feature: FeaturePresentation(
                displayName: FeatureInventory.displayName,
                symbolName: FeatureInventory.symbolName),
            FeatureEgo.feature: FeaturePresentation(
                displayName: FeatureEgo.displayName,
                symbolName: FeatureEgo.symbolName),
        ]
    }
}

/// A feature's display name and SF Symbol, as its own module declares them.
internal struct FeaturePresentation {
    internal let displayName: String
    internal let symbolName: String
}
