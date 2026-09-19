import AppCore
import DesignSystem

/// What the containers browser can narrow to.
internal enum InventoryContainerFilter: String, CaseIterable, Identifiable {
    case all
    case open
    case closed
    case full
    case retired

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .all: "All"
        case .open: "Open"
        case .closed: "Closed"
        case .full: "Full"
        case .retired: "Retired"
        }
    }

    /// Retired stands for every inactive container: they are the ones no
    /// longer offered as somewhere to put things.
    internal func matches(_ profile: InventoryContainerProfile) -> Bool {
        switch self {
        case .all: true
        case .open: profile.isOpen
        case .closed: profile.isClosed
        case .full: profile.isFull && profile.isActive
        case .retired: !profile.isActive
        }
    }
}

/// The browser's stats strip.
internal struct InventoryContainerStats: Equatable {
    internal let open: Int
    internal let closed: Int
    internal let full: Int
    internal let total: Int

    internal init(_ profiles: [InventoryContainerProfile]) {
        open = profiles.filter(InventoryContainerFilter.open.matches).count
        closed = profiles.filter(InventoryContainerFilter.closed.matches).count
        full = profiles.filter(InventoryContainerFilter.full.matches).count
        total = profiles.count
    }

    /// Open, closed, full and total, in the order the strip shows them.
    internal var tiles: [InventoryCountTile] {
        [
            InventoryCountTile(
                title: "Open", count: open, symbol: "shippingbox", tone: .popsWarning),
            InventoryCountTile(title: "Closed", count: closed, symbol: "shippingbox.fill"),
            InventoryCountTile(title: "Full", count: full, symbol: "tray.full"),
            InventoryCountTile(title: "Total", count: total, symbol: "square.grid.2x2"),
        ]
    }
}

/// The containers browser's own matching rule, pure so it can be tested
/// without a view: a container matches when its name, inventory code or the
/// path to it contains the query, case-insensitively.
internal enum InventoryContainerSearchMatching {
    internal static func matches(_ query: String, profile: InventoryContainerProfile) -> Bool {
        let haystacks = [profile.name, profile.item.code, profile.crumbs.joined(separator: " ")]
            .compactMap(\.self)
        return haystacks.contains { $0.localizedCaseInsensitiveContains(query) }
    }

    internal static func matching(
        _ query: String, in profiles: [InventoryContainerProfile]
    ) -> [InventoryContainerProfile] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return profiles }
        return profiles.filter { matches(trimmed, profile: $0) }
    }
}
