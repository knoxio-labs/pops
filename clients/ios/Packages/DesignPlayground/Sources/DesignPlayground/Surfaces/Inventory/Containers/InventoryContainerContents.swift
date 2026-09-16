import Foundation

/// What a container holds, as the detail and workspace screens count it.
///
/// Direct contents only. A nested container's own contents are that
/// container's count, not this one's, which is ADR-001's placement model
/// applied to counting rather than to display.
internal struct InventoryContainerContents: Equatable {
    internal let items: [InventoryFoundationItem]
    internal let recentlyAddedIDs: Set<String>
    internal let recentlyRemovedNames: [String]

    internal init(
        items: [InventoryFoundationItem],
        recentlyAddedIDs: Set<String> = [],
        recentlyRemovedNames: [String] = []
    ) {
        self.items = items
        self.recentlyAddedIDs = recentlyAddedIDs
        self.recentlyRemovedNames = recentlyRemovedNames
    }

    internal var itemCount: Int { items.count }

    /// The total the ADR's quantity model implies: a group of ten screws
    /// counts as ten units and one item.
    internal var unitCount: Int { items.reduce(0) { $0 + max($1.quantity.count, 0) } }

    internal var isEmpty: Bool { items.isEmpty }

    internal func matching(_ query: String) -> [InventoryFoundationItem] {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !search.isEmpty else { return items }
        return items.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }
}
