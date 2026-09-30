import AppCore

/// Answers universal search from the BFM, waiting out an offline phone
/// before it sends anything.
public struct PurchasesSearchProvider: SearchProvider {
    private let repository: any PurchasesRepository
    private let reachability: any NetworkReachability

    /// Creates a Purchases provider over the supplied repository and network path.
    public init(repository: any PurchasesRepository, reachability: any NetworkReachability) {
        self.repository = repository
        self.reachability = reachability
    }

    public var pillar: SearchPillar { .purchases }
    public var debounce: Duration { .milliseconds(300) }

    public func answers(
        to query: String,
        filter: PurchasesSearchFilter,
        after cursor: String?,
        limit: Int
    ) -> AsyncStream<SearchProviderEvent<PurchaseSearchHit>> {
        AsyncStream { continuation in
            let task = Task {
                do {
                    if !reachability.isSatisfied {
                        continuation.yield(.offline)
                        guard try await waitUntilOnline() else {
                            continuation.finish()
                            return
                        }
                    }
                    let page = try await repository.search(
                        text: query,
                        kind: Self.kind(filter.kind),
                        status: filter.status,
                        tags: filter.tags,
                        after: cursor,
                        limit: limit
                    )
                    continuation.yield(
                        .results(
                            SearchProviderPage(
                                hits: page.hits, nextCursor: page.nextCursor,
                                totalCount: page.totalCount)))
                } catch is CancellationError {
                } catch {
                    continuation.yield(.failed)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func kind(_ kind: PurchasesSearchKind) -> PurchaseSearchKind {
        switch kind {
        case .any: .all
        case .purchases: .purchases
        case .lines: .lines
        }
    }

    /// Waits for the phone to come back online, or returns `false` once the
    /// surrounding task is cancelled while still offline.
    private func waitUntilOnline() async throws -> Bool {
        for await satisfied in reachability.updates() {
            try Task.checkCancellation()
            if satisfied { return true }
        }
        return false
    }
}
