import AppCore
import Foundation

/// A universal-search row produced from Inventory's on-device replica.
public struct InventorySearchResult: Identifiable, Equatable, Sendable {
    internal let hit: InventorySearchHit

    /// The stable record-or-place identifier.
    public var id: String { hit.id }

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
