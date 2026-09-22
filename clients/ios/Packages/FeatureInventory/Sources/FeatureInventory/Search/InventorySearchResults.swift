import AppCore
import Foundation

/// What the search tab reads, from one state of the store: the replica's own
/// matches for the query, the places whose names match it, what was scanned
/// lately, and whether there is anything on this phone to search at all.
internal struct InventorySearchResults: Equatable, Sendable {
    /// How many recently scanned tiles fit across the empty search.
    internal static let scannedTiles = 4

    internal let isFirstRun: Bool
    /// The replica's matches, in the replica's order. Empty for an empty
    /// query, which shows recents rather than everything.
    internal let records: [InventoryRecord]
    internal let places: [InventorySearchPlace]
    internal let scanned: [InventoryRecord]
    internal let types: [InventoryTypeName]

    internal static func query(
        text: String, includeInactive: Bool, scannedIDs: [InventoryItem.ID]
    ) -> InventoryQuery<InventorySearchResults> {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return InventoryQuery { source in
            let reader = InventoryRecordReader(source: source)
            return InventorySearchResults(
                isFirstRun: source.inventoryReplicaStatus() == .empty,
                records: trimmed.isEmpty
                    ? []
                    : source.inventorySearch(text: trimmed, includeInactive: includeInactive)
                        .filter { !$0.isDeleted }
                        .map(reader.record),
                places: InventorySearchPlace.matching(trimmed, in: source.inventoryLocationTree()),
                scanned: scannedIDs.lazy
                    .compactMap { source.inventoryItem(id: $0) }
                    .filter { !$0.isDeleted }
                    .prefix(scannedTiles)
                    .map(reader.record),
                types: reader.typeNames)
        }
    }

    /// One ranked list: the records the filter keeps, and the places when no
    /// filter narrows the list, since a place has no placement, type or sync
    /// for one to test. Including inactive records is not such a narrowing.
    internal func hits(query: String, filter: InventorySearchFilter) -> [InventorySearchHit] {
        var placeFilter = filter
        placeFilter.includesInactive = false
        return InventorySearchRanking.rank(
            query, records: records.filter(filter.matches),
            places: placeFilter.isActive ? [] : places)
    }
}
