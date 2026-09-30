import AppCore
import Foundation

/// A universal-search row produced from Inventory's on-device replica.
public struct InventorySearchResult: Identifiable, Equatable, Sendable {
    internal let hit: InventorySearchHit

    /// The stable record-or-place identifier.
    public var id: String { hit.id }

    /// The Inventory record identifier, or nil when this result is a place.
    public var recordID: InventoryItem.ID? { hit.recordID }

    internal var record: InventoryRecord? {
        guard case .record(let record) = hit else { return nil }
        return record
    }

    internal init(_ hit: InventorySearchHit) {
        self.hit = hit
    }
}

/// Answers universal search immediately from Inventory's on-device replica.
public struct InventorySearchProvider: SearchProvider {
    private let store: any InventoryStore

    /// Creates an Inventory provider over the supplied replica store.
    public init(store: any InventoryStore) {
        self.store = store
    }

    public var pillar: SearchPillar { .inventory }
    public var debounce: Duration { .zero }

    /// Downloads Inventory's on-device replica to current; rethrows any
    /// failure so the caller can surface it and decide whether to re-ask.
    public func download() async throws {
        try await store.download()
    }

    /// The distinct Inventory types currently on this phone, read once from
    /// the replica's latest snapshot. Empty before the first successful
    /// download.
    public func currentTypeNames() async -> [InventoryTypeName] {
        for await results in store.observe(
            InventorySearchResults.query(text: "", includeInactive: false, scannedIDs: []))
        {
            return results.types
        }
        return []
    }

    public func answers(
        to query: String,
        filter: InventorySearchFilter,
        after cursor: String?,
        limit: Int
    ) -> AsyncStream<SearchProviderEvent<InventorySearchResult>> {
        guard let decodedCursor = Self.decodeCursor(cursor) else {
            return AsyncStream { continuation in
                continuation.yield(.failed)
                continuation.finish()
            }
        }
        guard cursor == nil || Self.isSearchCursor(decodedCursor) else {
            return AsyncStream { continuation in
                continuation.yield(.failed)
                continuation.finish()
            }
        }
        let page = InventoryPageRequest(
            limit: limit, cursor: decodedCursor)
        return AsyncStream { continuation in
            let task = Task {
                var answered = false
                for await results in store.observe(
                    InventorySearchPageResults.query(text: query, filter: filter, page: page))
                {
                    guard !Task.isCancelled else { break }
                    answered = true
                    if results.isFirstRun {
                        let event: SearchProviderEvent<InventorySearchResult> = .notOnPhone
                        continuation.yield(event)
                    } else {
                        let page = SearchProviderPage(
                            hits: results.hits.map(Self.result),
                            nextCursor: Self.encodeCursor(results.nextCursor))
                        continuation.yield(.results(page))
                    }
                    if cursor != nil { break }
                }
                if !answered && !Task.isCancelled { continuation.yield(.failed) }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func decodeCursor(_ token: String?) -> InventoryPageCursor?? {
        guard let token else { return .some(nil) }
        guard let data = Data(base64Encoded: token),
            let cursor = try? JSONDecoder().decode(InventoryPageCursor.self, from: data)
        else { return nil }
        return .some(cursor)
    }

    private static func encodeCursor(_ cursor: InventoryPageCursor?) -> String? {
        guard let cursor, let data = try? JSONEncoder().encode(cursor) else { return nil }
        return data.base64EncodedString()
    }

    private static func isSearchCursor(_ cursor: InventoryPageCursor?) -> Bool {
        guard case .searchHitRank = cursor else { return false }
        return true
    }

    private static func result(_ hit: InventorySearchHit) -> InventorySearchResult {
        InventorySearchResult(hit)
    }
}
