extension SearchPillarModel {
    /// Shapes this pillar's current answer for the supplied screen scope.
    public func section(scope: SearchScope) -> SearchSectionState<Provider.Hit>? {
        guard scope.includes(pillar) else { return nil }
        if !hits.isEmpty {
            return .results(
                rows: hits, total: totalCount ?? hits.count,
                query: answeredQuery, isRefining: false)
        }

        return switch answer {
        case .current:
            if pagingState == .loading {
                .loading
            } else if pagingState == .failed {
                .failed
            } else {
                nil
            }
        case .pending: .loading
        case .failed: .failed
        case .offline: .offline
        case .notOnPhone: .notOnPhone
        }
    }

    static func chipStatus(
        answer: SearchAnswer, hitCount: Int, query: String
    ) -> SearchChipStatus {
        switch answer {
        case .offline: .offline
        case .notOnPhone: .notOnPhone
        case .failed: query.isEmpty ? .none : .failed
        case .pending: query.isEmpty ? .none : .pending
        case .current: query.isEmpty ? .none : .count(hitCount)
        }
    }
}
