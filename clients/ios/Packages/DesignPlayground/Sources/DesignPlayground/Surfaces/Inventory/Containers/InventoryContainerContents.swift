import Foundation

/// One item directly inside a container, and when it went in.
internal struct InventoryContainedEntry: Identifiable, Equatable {
    internal let item: InventoryFoundationItem
    internal let added: String
    internal let isRecent: Bool

    internal init(item: InventoryFoundationItem, added: String, isRecent: Bool = false) {
        self.item = item
        self.added = added
        self.isRecent = isRecent
    }

    internal var id: String { item.id }
}

/// What the contents search narrows to besides its text: one type, and
/// whether only the recently added entries show.
internal struct InventoryContainerContentsFilter: Equatable {
    internal var type: String?
    internal var recentOnly = false

    internal var isActive: Bool { type != nil || recentOnly }

    internal func admits(_ entry: InventoryContainedEntry) -> Bool {
        (type == nil || entry.item.typeName == type) && (!recentOnly || entry.isRecent)
    }
}

/// What a container holds, newest first.
///
/// Direct contents only. A nested container's own contents are that
/// container's count, not this one's, which is ADR-001's placement model
/// applied to counting rather than to display.
internal struct InventoryContainerContents: Equatable {
    internal let entries: [InventoryContainedEntry]

    internal init(entries: [InventoryContainedEntry] = []) {
        self.entries = entries
    }

    internal var itemCount: Int { entries.count }

    /// The total ADR-001's quantity model implies: a group of ten screws
    /// counts as ten units and one item.
    internal var unitCount: Int { entries.reduce(0) { $0 + max($1.item.quantity.count, 0) } }

    internal var isEmpty: Bool { entries.isEmpty }

    /// The types present, once each, in alphabetical order, for the filter.
    internal var types: [String] {
        Set(entries.compactMap(\.item.typeName)).sorted()
    }

    internal var summary: String {
        let items = Self.counted(itemCount, "item")
        return itemCount == unitCount ? items : "\(items) · \(Self.counted(unitCount, "unit"))"
    }

    private static func counted(_ count: Int, _ noun: String) -> String {
        "\(count) \(noun)\(count == 1 ? "" : "s")"
    }

    internal func matching(
        _ query: String,
        filter: InventoryContainerContentsFilter = InventoryContainerContentsFilter()
    ) -> [InventoryContainedEntry] {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return entries.filter { entry in
            filter.admits(entry)
                && (search.isEmpty || entry.item.name.localizedCaseInsensitiveContains(search))
        }
    }
}
