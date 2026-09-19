import AppCore
import Foundation

/// One item directly inside a container, and when it went in.
internal struct InventoryContainedEntry: Identifiable, Equatable {
    /// How long something counts as recently added, for the contents filter.
    internal static let recentWindow: TimeInterval = 24 * 60 * 60

    internal let item: InventoryItem
    internal let typeName: String?
    /// The last time the row changed, which for something packed and left
    /// alone is when it went in. The replica keeps no separate "added" time.
    internal let added: Date
    internal let isRecent: Bool

    internal init(item: InventoryItem, typeName: String?, now: Date) {
        self.item = item
        self.typeName = typeName
        added = item.updatedAt
        isRecent = now.timeIntervalSince(item.updatedAt) < Self.recentWindow
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
        (type == nil || entry.typeName == type) && (!recentOnly || entry.isRecent)
    }
}

/// What a container holds, newest first.
///
/// Direct contents only. A nested container's own contents are that
/// container's count, not this one's: placement is counted where it is
/// stored, not where it resolves to.
internal struct InventoryContainerContents: Equatable {
    internal let entries: [InventoryContainedEntry]

    internal init(entries: [InventoryContainedEntry] = []) {
        self.entries = entries.sorted { $0.added > $1.added }
    }

    internal var itemCount: Int { entries.count }

    /// A group of ten screws counts as ten units and one item.
    internal var unitCount: Int { entries.reduce(0) { $0 + max($1.item.quantity.count, 0) } }

    internal var isEmpty: Bool { entries.isEmpty }

    /// The types present, once each, in alphabetical order, for the filter.
    internal var types: [String] {
        Set(entries.compactMap(\.typeName)).sorted()
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

/// One container as its page and the lists need it: the item itself, where
/// it is, and what it holds.
internal struct InventoryContainerProfile: Identifiable, Equatable {
    internal let item: InventoryItem
    internal let typeName: String?
    /// The names on the way to where it sits, from the top level down.
    internal let crumbs: [String]
    internal let contents: InventoryContainerContents

    internal init(
        reading source: any InventoryQuerySource, container item: InventoryItem, now: Date = .now
    ) {
        let catalogue = source.inventoryCatalogue()
        let typeName = { (key: String?) in key.flatMap { catalogue.type(forKey: $0)?.name } }
        self.item = item
        self.typeName = typeName(item.typeKey)
        crumbs = InventoryPlacementCrumbs(source: source).names(of: item.placement)
        contents = InventoryContainerContents(
            entries: source.inventoryContents(ofContainer: item.id).filter(\.isLive).map {
                InventoryContainedEntry(item: $0, typeName: typeName($0.typeKey), now: now)
            })
    }

    internal var id: String { item.id }
    internal var name: String { item.name }
    internal var isActive: Bool { item.lifecycle == .active }
    internal var isOpen: Bool { item.containment?.access == .open && isActive }
    internal var isClosed: Bool { item.containment?.access == .closed && isActive }
    internal var isFull: Bool { item.containment?.isFull ?? false }
    internal var path: String { crumbs.joined(separator: " › ") }
}
