/// How old a local copy has to be before its age is worth saying, and worth
/// noticing.
///
/// Two thresholds rather than one, because "out of date" is not a single
/// state. A catalogue that last synced twenty minutes ago is the phone working
/// normally and must show nothing (ADR-001: the state the phone is almost
/// always in must not look like a problem). Between then and a day, the age is
/// worth stating where a person is about to act on the answer, a search hit, a
/// scanned label, but it is not worth a mark of its own. Past a day it reaches
/// the visible tier and the reader is told without asking.
///
/// The numbers are a working default, not a decided one: what is being asked
/// on the device is how the age is *disclosed*, and a threshold can move
/// without redrawing anything.
internal enum InventoryStaleness {
    internal enum Disclosure: Equatable {
        /// Recent enough that saying so would be noise.
        case silent
        /// Worth saying where a person is about to act on it.
        case dated
        /// Worth a mark the reader does not have to look for.
        case stale
    }

    /// Below this, the age is not mentioned anywhere.
    internal static let datedAfterMinutes = 30
    /// At or above this, the local copy is stale in ADR-001's sense.
    internal static let staleAfterMinutes = 24 * 60

    internal static func disclosure(minutesSinceSync: Int) -> Disclosure {
        switch minutesSinceSync {
        case staleAfterMinutes...: .stale
        case datedAfterMinutes...: .dated
        default: .silent
        }
    }

    /// The sync state an age alone puts a record in.
    ///
    /// Only ever `.synchronized` or `.stale`: age cannot produce
    /// `.needsAttention`, which is a failed change and not an old one. A screen
    /// that let a long gap escalate to urgent would interrupt a person for
    /// having been on a plane.
    internal static func sync(minutesSinceSync: Int) -> InventorySync {
        disclosure(minutesSinceSync: minutesSinceSync) == .stale ? .stale : .synchronized
    }

    /// The age in the words a row uses. Coarse on purpose: a reader deciding
    /// whether to trust a shelf location does not need the minute.
    internal static func age(minutesSinceSync minutes: Int) -> String {
        switch minutes {
        case ..<1: "just now"
        case ..<60: "\(minutes) min ago"
        case ..<(48 * 60): hours(minutes)
        default: "\(minutes / (24 * 60)) days ago"
        }
    }

    private static func hours(_ minutes: Int) -> String {
        let count = minutes / 60
        return count == 1 ? "1 hour ago" : "\(count) hours ago"
    }
}
