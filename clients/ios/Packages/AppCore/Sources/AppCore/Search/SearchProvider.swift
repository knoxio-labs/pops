import Foundation

/// One event produced while a search provider answers a query.
public enum SearchProviderEvent<Hit: Sendable>: Sendable {
    /// The provider's current ordered matches.
    case results([Hit])
    /// The provider failed to answer the query.
    case failed
    /// The provider cannot answer because the network is offline.
    case offline
    /// The provider's on-device data has not been downloaded.
    case notOnPhone
}

/// A pillar-specific source of universal search results.
///
/// Implementations must end their stream promptly when its consuming task is
/// cancelled. A stream may yield more than one result event when an on-device
/// source changes without a new query.
public protocol SearchProvider: Sendable {
    associatedtype Hit: Sendable
    associatedtype Filter: Sendable

    /// The pillar this provider answers for.
    var pillar: SearchPillar { get }
    /// How long callers should debounce before asking this provider.
    var debounce: Duration { get }

    /// Starts answering one query with the supplied pillar-specific filter.
    func answers(to query: String, filter: Filter) -> AsyncStream<SearchProviderEvent<Hit>>
}
