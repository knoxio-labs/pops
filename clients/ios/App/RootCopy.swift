import AppCore

/// Every word the shell shows, in one place.
///
/// English string literals, like `DesignSystem`'s state primitives and
/// `FeaturePairing`'s copy, and for the same reason: the app has no
/// localisation layer yet, and scattering the copy through the views now would
/// make adding one a hunt.
internal enum RootCopy {
    internal static let retry = "Try again"

    internal static let degraded =
        "Some of Pops could not be reached, so this may be out of date."

    /// Why there is nothing on screen.
    ///
    /// The two reasons the BFM distinguishes are kept distinct here, because
    /// they are the difference between waiting and updating. Collapsing them
    /// into "something went wrong" would waste the one piece of information
    /// this endpoint exists to carry.
    internal static func nothingAvailable(_ withheld: [FeatureAvailability]) -> String {
        guard !withheld.isEmpty else {
            return "Your Pops server is not offering anything this app can show yet."
        }
        return withheld.map(reason(for:)).joined(separator: " ")
    }

    private static func reason(for feature: FeatureAvailability) -> String {
        switch feature.reachability {
        case .contractMismatch:
            return "\(name(of: feature.id)) needs a newer version of this app."
        default:
            return "\(name(of: feature.id)) is not available right now."
        }
    }

    /// A feature's name, falling back to the id the BFM sent.
    ///
    /// The fallback is the point: this build can be told about a feature it has
    /// never heard of, and the raw id is a worse sentence than a translated one
    /// but a far better one than a blank. Shared with the tab bar's labels —
    /// one name per feature, not one for the empty state and a second for the
    /// switcher.
    internal static func name(of feature: MobileFeature) -> String {
        switch feature {
        case .transactions: "Transactions"
        case .accounts: "Accounts"
        case .receiptCapture: "Receipts"
        default: feature.rawValue
        }
    }

    /// The tab icon for a feature. Falls back to a generic glyph rather than no
    /// glyph, for the same reason ``name(of:)`` falls back to the raw id — a
    /// tab this build has never heard of is still a tab a user can tap.
    internal static func symbol(for feature: MobileFeature) -> String {
        switch feature {
        case .transactions: "list.bullet.rectangle"
        case .accounts: "building.columns"
        case .receiptCapture: "doc.text.viewfinder"
        default: "square.grid.2x2"
        }
    }
}
