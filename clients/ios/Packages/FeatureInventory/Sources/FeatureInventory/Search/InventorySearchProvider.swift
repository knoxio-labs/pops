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
        filter: InventorySearchFilter
    ) -> AsyncStream<SearchProviderEvent<InventorySearchResult>> {
        AsyncStream { continuation in
            let task = Task {
                var answered = false
                for await results in store.observe(
                    InventorySearchResults.query(
                        text: query,
                        includeInactive: filter.includesInactive,
                        scannedIDs: []))
                {
                    guard !Task.isCancelled else { break }
                    answered = true
                    if results.isFirstRun {
                        continuation.yield(.notOnPhone)
                    } else {
                        continuation.yield(
                            .results(results.hits(query: query, filter: filter).map(Self.result)))
                    }
                }
                if !answered && !Task.isCancelled { continuation.yield(.failed) }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func result(_ hit: InventorySearchHit) -> InventorySearchResult {
        InventorySearchResult(hit)
    }
}
