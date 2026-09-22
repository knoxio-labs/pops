/// The content one pillar contributes to a universal search screen.
public enum SearchSectionState<Hit: Sendable>: Sendable {
    /// Ordered matches, their uncapped total and the query they answer.
    case results(rows: [Hit], total: Int, query: String, isRefining: Bool)
    /// The pillar has no earlier rows to retain while answering.
    case loading
    /// The pillar failed to answer and can be retried.
    case failed
    /// The pillar requires a network path that is unavailable.
    case offline
    /// The pillar's on-device data has not been downloaded.
    case notOnPhone
}

extension SearchSectionState: Equatable where Hit: Equatable {}
