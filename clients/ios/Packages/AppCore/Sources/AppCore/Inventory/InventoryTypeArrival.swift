import Foundation

/// A type the catalogue gained that covers items still waiting for one: the
/// question the "type arrived" sheet asks, once, over the dashboard.
///
/// An item is covered when it is untyped and the free text it was migrated
/// with names one of the type's `legacyLabels`. The type's own name never
/// matches on its own: a label is the server's explicit statement of which
/// old spellings the type replaces.
public struct InventoryTypeArrival: Hashable, Sendable {
    public let type: InventoryType
    /// The covered items, by name.
    public let items: [InventoryItem]

    public init(type: InventoryType, items: [InventoryItem]) {
        self.type = type
        self.items = items
    }

    /// The keys of the types `next` has and `previous` lacks, in `next`'s
    /// order. Nothing arrives with the first catalogue a replica stores:
    /// with no `previous` there is no change to announce, only a starting
    /// point.
    public static func addedTypeKeys(
        from previous: InventoryCatalogue?, to next: InventoryCatalogue
    ) -> [String] {
        guard let previous, previous.version != next.version else { return [] }
        let known = Set(previous.types.map(\.key))
        return next.types.map(\.key).filter { !known.contains($0) }
    }

    /// Whether `type` covers `item`: the item is untyped and its
    /// `legacyType` equals one of the type's `legacyLabels`, ignoring case
    /// and surrounding whitespace, because the old free text was typed by
    /// hand.
    public static func covers(_ type: InventoryType, _ item: InventoryItem) -> Bool {
        guard item.typeKey == nil, let legacy = normalized(item.legacyType) else { return false }
        return type.legacyLabels.contains { normalized($0) == legacy }
    }

    /// The oldest awaiting arrival that covers at least one active item, or
    /// nil when there is nothing to ask.
    ///
    /// A type that declares a required field is never offered: Apply types
    /// every picked item with no field values, which such a type refuses, so
    /// those items are left for the ordinary edit form.
    public static func next(reading source: any InventoryQuerySource) -> InventoryTypeArrival? {
        let awaiting = source.inventoryAwaitingTypeArrivals()
        guard !awaiting.isEmpty else { return nil }
        let catalogue = source.inventoryCatalogue()
        let untyped = source.inventoryItems(includeInactive: false).filter {
            $0.typeKey == nil && $0.legacyType != nil
        }
        guard !untyped.isEmpty else { return nil }
        for key in awaiting {
            guard let type = catalogue.type(forKey: key),
                !type.fields.contains(where: \.required)
            else { continue }
            let covered = untyped.filter { covers(type, $0) }
                .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            if !covered.isEmpty { return InventoryTypeArrival(type: type, items: covered) }
        }
        return nil
    }

    private static func normalized(_ text: String?) -> String? {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines),
            !trimmed.isEmpty
        else { return nil }
        return trimmed.lowercased()
    }
}
