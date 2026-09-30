private enum SearchNextPageOutcome<Hit> {
    case page(SearchProviderPage<Hit>)
    case stopped(SearchAnswer)
}

extension SearchPillarModel {
    func consumeNextPages(
        provider: Provider,
        query: String,
        filter: Provider.Filter,
        startingAt initialCursor: String,
        generation currentGeneration: Int
    ) async {
        var cursor: String? = initialCursor
        while let requestedCursor = cursor {
            guard isCurrent(currentGeneration) else { return }
            let priorCount = hits.count
            let outcome = await nextPage(
                provider: provider, query: query, filter: filter,
                cursor: requestedCursor, generation: currentGeneration)
            guard isCurrent(currentGeneration) else { return }
            let page: SearchProviderPage<Provider.Hit>
            switch outcome {
            case .page(let receivedPage):
                page = receivedPage
            case .stopped(let terminalAnswer):
                finishNextPage(with: terminalAnswer)
                return
            }
            guard applyNextPage(page, after: requestedCursor) else { return }
            cursor = page.nextCursor
            guard continuePagingAfterDuplicatePage(previousCount: priorCount) else { return }
        }
    }

    private func nextPage(
        provider: Provider,
        query: String,
        filter: Provider.Filter,
        cursor: String,
        generation currentGeneration: Int
    ) async -> SearchNextPageOutcome<Provider.Hit> {
        var terminalAnswer: SearchAnswer = .failed
        for await event in provider.answers(
            to: query, filter: filter, after: cursor, limit: Self.pageSize)
        {
            guard isCurrent(currentGeneration) else { return .stopped(.failed) }
            switch event {
            case .results(let page): return .page(page)
            case .failed: return .stopped(.failed)
            case .offline:
                noteOfflinePage()
                terminalAnswer = .offline
            case .notOnPhone: return .stopped(.notOnPhone)
            }
        }
        return .stopped(terminalAnswer)
    }
}
