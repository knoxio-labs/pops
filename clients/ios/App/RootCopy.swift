import AppCore
import Foundation

/// Every word the shell shows, in one place.
///
/// Each sentence is written here in English and resolved through the app
/// target's String Catalog, where the English is the key and `pt-BR` is the
/// translation. A feature's own name comes from its module, already resolved.
internal enum RootCopy {
    private static let localized = LocalizedCopy(bundle: .main)

    internal static var more: String { localized("More") }
    internal static var done: String { localized("Done") }

    internal static var retry: String { localized("Try again") }

    internal static var degraded: String {
        localized("Some of Pops could not be reached, so this may be out of date.")
    }

    internal static var dismissDegraded: String { localized("Dismiss") }

    internal static var showsErrorDetails: String { localized("Shows error details") }
    internal static var dismissError: String { localized("Dismiss error") }
    internal static var errorDetailsTitle: String { localized("Error details") }
    internal static var whatHappened: String { localized("What happened") }
    internal static var diagnostics: String { localized("Diagnostics") }
    internal static var copy: String { localized("Copy") }
    internal static var copied: String { localized("Copied") }
    internal static var copyHint: String { localized("Copies the message and diagnostics") }
    internal static var recentErrorsTitle: String { localized("Recent errors") }
    internal static var noRecentErrors: String { localized("No recent errors") }
    internal static var recentErrorsEmpty: String {
        localized("Failures from this device will appear here.")
    }

    /// The rows under ``diagnostics``. Their values are identifiers for a bug
    /// report and are shown as they are.
    internal enum DiagnosticLabel {
        internal static var code: String { RootCopy.localized("Code") }
        internal static var requestID: String { RootCopy.localized("Request ID") }
        internal static var operation: String { RootCopy.localized("Operation") }
        internal static var time: String { RootCopy.localized("Time") }
        internal static var build: String { RootCopy.localized("Build") }
    }

    /// A `pops` URL scheme link whose pillar has no screen registered in this
    /// build. Not an error sentence: the code is fine, this build just cannot
    /// show it yet.
    internal static func opensIn(_ pillar: String) -> String {
        localized("Opens in \(pillar.capitalized)")
    }

    /// Why there is nothing on screen.
    ///
    /// The two reasons the BFM distinguishes are kept distinct here, because
    /// they are the difference between waiting and updating. Collapsing them
    /// into "something went wrong" would waste the one piece of information
    /// this endpoint exists to carry.
    internal static func nothingAvailable(_ withheld: [FeatureAvailability]) -> String {
        guard !withheld.isEmpty else {
            return localized("Your Pops server is not offering anything this app can show yet.")
        }
        return withheld.map(reason(for:)).joined(separator: " ")
    }

    private static func reason(for feature: FeatureAvailability) -> String {
        switch feature.reachability {
        case .contractMismatch:
            return localized("\(name(of: feature.id)) needs a newer version of this app.")
        default:
            return localized("\(name(of: feature.id)) is not available right now.")
        }
    }

    /// A feature's name, falling back to the id the BFM sent.
    ///
    /// The fallback is the point: this build can be told about a feature it has
    /// never heard of, and the raw id is a worse sentence than a translated one
    /// but a far better one than a blank. Shared with the tab bar's labels —
    /// one name per feature, not one for the empty state and a second for the
    /// switcher.
    ///
    /// Sourced from ``RootFeature/presentation``, which each renderable
    /// feature module populates with its own name — not switched on here,
    /// because a switch over feature ids is exactly the thing a fourth
    /// feature would need this file edited to extend.
    internal static func name(of feature: MobileFeature) -> String {
        RootFeature.presentation[feature]?.displayName ?? feature.rawValue
    }

    /// The tab icon for a feature. Falls back to a generic glyph rather than no
    /// glyph, for the same reason ``name(of:)`` falls back to the raw id — a
    /// tab this build has never heard of is still a tab a user can tap.
    internal static func symbol(for feature: MobileFeature) -> String {
        RootFeature.presentation[feature]?.symbolName ?? "square.grid.2x2"
    }
}
