import Foundation
import Observation

/// Non-generic status exposed by every pillar search model.
@MainActor
public protocol SearchPillarStatus: AnyObject {
    /// The pillar whose status this model represents.
    var pillar: SearchPillar { get }
    /// The compact status shown by the pillar's scope chip.
    var chipStatus: SearchChipStatus { get }
}

/// Coordinates one search provider across debounce, result pages, retry and cancellation.
@MainActor @Observable
public final class SearchPillarModel<Provider: SearchProvider>: SearchPillarStatus {
    /// Maximum number of matches requested in one page.
    public static var pageSize: Int { 20 }

    /// Where this pillar's answer to the requested query stands.
    public private(set) var answer = SearchAnswer.current
    /// The provider's accumulated, ordered matches.
    public private(set) var hits: [Provider.Hit] = []
    /// The query the current matches answer.
    public private(set) var answeredQuery = ""
    /// The provider's reported full match count, when available.
    public private(set) var totalCount: Int?
    /// The state shown below loaded rows for the next page.
    public private(set) var pagingState: SearchPagingState = .idle

    @ObservationIgnored private let provider: Provider
    @ObservationIgnored private var request: Request?
    @ObservationIgnored private var nextCursor: String?
    @ObservationIgnored private var acceptedCursors: Set<String> = []
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var nextPageTask: Task<Void, Never>?

    /// Creates a model for one pillar-specific provider.
    public init(provider: Provider) {
        self.provider = provider
    }

    /// The pillar this model's provider searches.
    public var pillar: SearchPillar { provider.pillar }

    /// The current result count or availability state for this provider.
    public var chipStatus: SearchChipStatus {
        Self.chipStatus(
            answer: answer, hitCount: totalCount ?? hits.count, query: request?.query ?? "")
    }

    /// Debounces and starts a first-page query, cancelling any superseded request.
    public func ask(_ query: String, filter: Provider.Filter) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        generation += 1
        task?.cancel()
        nextPageTask?.cancel()
        task = nil
        nextPageTask = nil
        request = Request(query: trimmed, filter: filter)
        hits = []
        answeredQuery = ""
        totalCount = nil
        nextCursor = nil
        acceptedCursors = []
        pagingState = .idle

        guard !trimmed.isEmpty else {
            answer = .current
            return
        }

        answer = .pending(previous: nil)
        let currentGeneration = generation
        let debounce = provider.debounce
        task = Task { [weak self, provider] in
            if debounce > .zero {
                do {
                    try await Task.sleep(for: debounce)
                } catch {
                    return
                }
            }
            guard !Task.isCancelled else { return }
            guard let self else { return }
            await self.consumeFirstPage(
                provider: provider, query: trimmed, filter: filter,
                generation: currentGeneration)
        }
    }

    /// Cancels provider work while retaining rows already loaded for this request.
    public func cancelPendingRequest() {
        generation += 1
        task?.cancel()
        nextPageTask?.cancel()
        task = nil
        nextPageTask = nil
    }

    /// Repeats the latest non-empty request with the same filter.
    public func retry() {
        guard let request else { return }
        ask(request.query, filter: request.filter)
    }

    /// Loads the next bounded page when a result boundary becomes visible.
    public func loadNextPageIfNeeded() async {
        await startNextPageIfNeeded()
    }

    /// Retries the same cursor after the next-page request failed.
    public func retryNextPage() async {
        guard pagingState == .failed else { return }
        await startNextPageIfNeeded()
    }

    /// Shapes this pillar's current answer for the supplied screen scope.
    public func section(scope: SearchScope) -> SearchSectionState<Provider.Hit>? {
        guard scope.includes(pillar) else { return nil }
        if !hits.isEmpty {
            return .results(
                rows: hits, total: totalCount ?? hits.count,
                query: answeredQuery, isRefining: false)
        }

        switch answer {
        case .current:
            if pagingState == .loading { return .loading }
            if pagingState == .failed { return .failed }
            return nil
        case .pending:
            return .loading
        case .failed:
            return .failed
        case .offline:
            return .offline
        case .notOnPhone:
            return .notOnPhone
        }
    }

    internal static func chipStatus(
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

    private func consumeFirstPage(
        provider: Provider, query: String, filter: Provider.Filter,
        generation currentGeneration: Int
    ) async {
        var receivedPage = false
        for await event in provider.answers(
            to: query, filter: filter, after: nil, limit: Self.pageSize)
        {
            guard isCurrent(currentGeneration) else { return }
            switch event {
            case .results(let page):
                receivedPage = true
                applyFirstPage(page, query: query)
                if hits.isEmpty, nextCursor != nil {
                    await loadNextPageIfNeeded()
                }
            case .failed:
                answer = .failed
            case .offline:
                answer = .offline
            case .notOnPhone:
                answer = .notOnPhone
            }
        }

        guard isCurrent(currentGeneration) else { return }
        if !receivedPage, case .pending = answer {
            answer = .failed
        }
    }

    private func startNextPageIfNeeded() async {
        guard pagingState != .loading, let request, let cursor = nextCursor else { return }
        let currentGeneration = generation
        pagingState = .loading
        let pageTask = Task { [weak self, provider] in
            guard let self else { return }
            await self.consumeNextPages(
                provider: provider, query: request.query, filter: request.filter,
                startingAt: cursor, generation: currentGeneration)
        }
        nextPageTask = pageTask
        await pageTask.value
        if generation == currentGeneration {
            nextPageTask = nil
        }
    }

    private func consumeNextPages(
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
            var receivedPage: SearchProviderPage<Provider.Hit>?
            var terminalAnswer: SearchAnswer?

            for await event in provider.answers(
                to: query, filter: filter, after: requestedCursor, limit: Self.pageSize)
            {
                guard isCurrent(currentGeneration) else { return }
                switch event {
                case .results(let page):
                    receivedPage = page
                    break
                case .failed:
                    terminalAnswer = .failed
                case .offline:
                    terminalAnswer = .offline
                    answer = .offline
                    continue
                case .notOnPhone:
                    terminalAnswer = .notOnPhone
                }
                if receivedPage != nil || terminalAnswer != nil { break }
            }

            guard isCurrent(currentGeneration) else { return }
            guard let page = receivedPage else {
                answer = terminalAnswer ?? .failed
                pagingState = .failed
                return
            }

            if let next = page.nextCursor,
                next == requestedCursor || acceptedCursors.contains(next)
            {
                answer = .failed
                pagingState = .failed
                return
            }

            appendUnique(page.hits)
            if let reported = page.totalCount {
                totalCount = reported
            }
            nextCursor = page.nextCursor
            if let next = page.nextCursor {
                acceptedCursors.insert(next)
                pagingState = .idle
            } else {
                pagingState = .exhausted
            }
            answer = .current
            cursor = page.nextCursor

            guard hits.count == priorCount, cursor != nil else { return }
            pagingState = .loading
        }
    }

    private func applyFirstPage(_ page: SearchProviderPage<Provider.Hit>, query: String) {
        hits = Self.unique(page.hits)
        answeredQuery = query
        totalCount = page.totalCount
        nextCursor = page.nextCursor
        acceptedCursors = []
        if let cursor = page.nextCursor {
            acceptedCursors.insert(cursor)
        }
        pagingState = page.nextCursor == nil ? .exhausted : .idle
        answer = .current
    }

    private func appendUnique(_ pageHits: [Provider.Hit]) {
        var known = Set(hits.map(\.id))
        hits.append(contentsOf: Self.unique(pageHits).filter { known.insert($0.id).inserted })
    }

    private static func unique(_ pageHits: [Provider.Hit]) -> [Provider.Hit] {
        var seen = Set<Provider.Hit.ID>()
        return pageHits.filter { seen.insert($0.id).inserted }
    }

    private func isCurrent(_ candidate: Int) -> Bool {
        !Task.isCancelled && generation == candidate
    }

    private struct Request {
        let query: String
        let filter: Provider.Filter
    }
}
