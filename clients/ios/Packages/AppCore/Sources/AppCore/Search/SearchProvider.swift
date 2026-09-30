/// One bounded page returned by a pillar search provider.
public struct SearchProviderPage<Hit: Sendable>: Sendable {
    /// Matches in provider ranking order.
    public let hits: [Hit]
    /// Cursor for the next page, or `nil` when the provider has no more matches.
    public let nextCursor: String?
    /// The provider's complete match count when it can report one.
    public let totalCount: Int?

    /// Creates one page of ordered matches and its optional continuation data.
    public init(hits: [Hit], nextCursor: String?, totalCount: Int? = nil) {
        self.hits = hits
        self.nextCursor = nextCursor
        self.totalCount = totalCount
    }
}

/// One event produced while a search provider answers a query.
public enum SearchProviderEvent<Hit: Sendable>: Sendable {
    /// The provider's current ordered result page.
    case results(SearchProviderPage<Hit>)
    /// The provider failed to answer the query.
    case failed
    /// The provider cannot answer because the network is offline.
    case offline
    /// The provider's on-device data has not been downloaded.
    case notOnPhone
}

/// State shown below a pillar's loaded search results while paging.
public enum SearchPagingState: Equatable, Sendable {
    /// The next page is available but has not been requested.
    case idle
    /// The next page is being requested.
    case loading
    /// The next page failed and can be retried at the same cursor.
    case failed
    /// The provider has no further page.
    case exhausted
}

/// A pillar-specific source of universal search results.
///
/// Implementations must end their stream promptly when its consuming task is
/// cancelled. First-page streams may yield refreshed first pages; later-page
/// streams should yield a bounded page and finish.
public protocol SearchProvider: Sendable {
    /// The result type the provider returns.
    associatedtype Hit: Identifiable & Sendable where Hit.ID: Hashable & Sendable
    /// The pillar-specific filter applied to each page request.
    associatedtype Filter: Equatable & Sendable

    /// The pillar this provider answers for.
    var pillar: SearchPillar { get }
    /// How long callers should debounce before asking this provider.
    var debounce: Duration { get }

    /// Starts or continues answering one query with the supplied filter.
    func answers(
        to query: String, filter: Filter, after cursor: String?, limit: Int
    ) -> AsyncStream<SearchProviderEvent<Hit>>
}
