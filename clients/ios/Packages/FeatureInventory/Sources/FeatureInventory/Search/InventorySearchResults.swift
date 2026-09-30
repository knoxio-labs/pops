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

internal struct InventorySearchPageResults: Sendable {
    internal let isFirstRun: Bool
    internal let hits: [InventorySearchHit]
    internal let nextCursor: InventoryPageCursor?

    internal static func query(
        text: String, filter: InventorySearchFilter, page: InventoryPageRequest
    ) -> InventoryQuery<InventorySearchPageResults> {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let placement: InventoryItemPagePlacement = switch filter.placement {
        case .any: .any
        case .inHand: .hand
        case .direct: .location
        case .contained: .container
        }
        let access: InventoryItemPageAccess = switch filter.containerState {
        case .any: .any
        case .open: .open
        case .closed: .closed
        }
        let missing: InventoryItemPageMissing = switch filter.missing {
        case .nothing: .none
        case .type: .type
        case .code: .code
        case .photo: .photo
        }
        let sync: InventoryItemPageSync = switch filter.sync {
        case .any: .any
        case .waiting: .waiting
        case .stale: .stale
        case .needsAttention: .needsAttention
        }
        let itemFilter = InventoryItemPageFilter(
            includeInactive: filter.includesInactive,
            placement: placement,
            access: access,
            typeKey: filter.type?.key,
            quantityGreaterThanOne: filter.quantity == .several,
            missing: missing,
            sync: sync)
        var locationFilter = filter
        locationFilter.includesInactive = false
        let includeLocations = !locationFilter.isActive
        return InventoryQuery { source in
            let reader = InventoryRecordReader(source: source)
            guard !trimmed.isEmpty else {
                return InventorySearchPageResults(
                    isFirstRun: source.inventoryReplicaStatus() == .empty, hits: [],
                    nextCursor: nil)
            }
            let resultPage = source.inventorySearchPage(
                InventorySearchPageQuery(
                    text: trimmed, filter: itemFilter, includeLocations: includeLocations,
                    page: page))
            let hits = resultPage.rows.compactMap { row -> InventorySearchHit? in
                switch row {
                case .item(let item): return .record(reader.record(item))
                case .location(let location):
                    var parents: [String] = []
                    var parentId = location.parentId
                    while let currentId = parentId,
                        let parent = source.inventoryLocation(id: currentId)
                    {
                        parents.insert(parent.name, at: 0)
                        parentId = parent.parentId
                    }
                    return .place(
                        InventorySearchPlace(id: location.id, name: location.name, parents: parents))
                }
            }
            return InventorySearchPageResults(
                isFirstRun: source.inventoryReplicaStatus() == .empty, hits: hits,
                nextCursor: resultPage.nextCursor)
        }
    }
}
