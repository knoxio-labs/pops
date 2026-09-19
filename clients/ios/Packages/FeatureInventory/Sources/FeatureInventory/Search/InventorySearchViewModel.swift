import AppCore
import Foundation
import Observation

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

/// The search tab's state and writes, over `InventoryStore`. Search runs over
/// the replica, online or not, so results never reorder when connectivity
/// changes.
@MainActor @Observable
internal final class InventorySearchViewModel {
    internal enum Phase: Equatable {
        case loading
        case loaded(InventorySearchResults)
        case unavailable
    }

    internal var query = ""
    internal var filter = InventorySearchFilter()
    internal private(set) var phase: Phase = .loading
    internal let writer: InventoryWriter
    /// Move's writes: the one runner every placement picker in this package shares.
    internal let runner: InventoryCommandRunner
    private let store: any InventoryStore

    internal init(store: any InventoryStore) {
        self.store = store
        writer = InventoryWriter(store: store)
        runner = InventoryCommandRunner(store: store)
    }

    internal var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    internal var observationKey: InventoryObservationKey {
        InventoryObservationKey(text: trimmedQuery, includeInactive: filter.includesInactive)
    }

    internal var results: InventorySearchResults? {
        guard case .loaded(let results) = phase else { return nil }
        return results
    }

    internal var hits: [InventorySearchHit] {
        results?.hits(query: trimmedQuery, filter: filter) ?? []
    }

    /// The records among `hits`, which is what selection acts on.
    internal var hitRecords: [InventoryRecord] {
        hits.compactMap { hit in
            guard case .record(let record) = hit else { return nil }
            return record
        }
    }

    /// Follows the store for the current key until the calling task is
    /// cancelled, keeping the last answer up until the new one arrives.
    internal func observe(scannedIDs: [InventoryItem.ID]) async {
        var answered = false
        for await results in store.observe(
            InventorySearchResults.query(
                text: observationKey.text, includeInactive: observationKey.includeInactive,
                scannedIDs: scannedIDs))
        {
            answered = true
            phase = .loaded(results)
        }
        if !answered && results == nil && !Task.isCancelled { phase = .unavailable }
    }

    /// First launch's Download: takes the replica from empty to current.
    internal func download() async {
        do {
            try await store.download()
        } catch {
            writer.report(error)
        }
    }

    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }
}
