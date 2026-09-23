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

/// Coordinates one search provider across debounce, retry and cancellation.
@MainActor @Observable
public final class SearchPillarModel<Provider: SearchProvider>: SearchPillarStatus {
    /// Where this pillar's answer to the requested query stands.
    public private(set) var answer = SearchAnswer.current
    /// The provider's latest ordered matches.
    public private(set) var hits: [Provider.Hit] = []
    /// The query the current matches answer.
    public private(set) var answeredQuery = ""

    @ObservationIgnored private let provider: Provider
    @ObservationIgnored private var request: Request?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var task: Task<Void, Never>?

    /// Creates a model for one pillar-specific provider.
    public init(provider: Provider) {
        self.provider = provider
    }

    public var pillar: SearchPillar { provider.pillar }

    public var chipStatus: SearchChipStatus {
        Self.chipStatus(answer: answer, hitCount: hits.count, query: request?.query ?? "")
    }

    /// Debounces and starts a query, cancelling any superseded request.
    public func ask(_ query: String, filter: Provider.Filter) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        generation += 1
        task?.cancel()
        request = Request(query: trimmed, filter: filter)

        guard !trimmed.isEmpty else {
            answer = .current
            hits = []
            answeredQuery = ""
            task = nil
            return
        }

        answer = .pending(previous: hits.isEmpty ? nil : answeredQuery)
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

            for await event in provider.answers(to: trimmed, filter: filter) {
                guard !Task.isCancelled, let self, self.generation == currentGeneration else {
                    return
                }
                self.apply(event, query: trimmed)
            }
        }
    }

    /// Repeats the latest non-empty request with the same filter.
    public func retry() {
        guard let request else { return }
        ask(request.query, filter: request.filter)
    }

    /// Shapes this pillar's current answer for the supplied screen scope.
    public func section(scope: SearchScope, cap: Int) -> SearchSectionState<Provider.Hit>? {
        guard scope.includes(pillar) else { return nil }

        switch answer {
        case .current:
            return results(query: answeredQuery, scope: scope, cap: cap, isRefining: false)
        case .pending(let previous):
            guard let previous, !hits.isEmpty else { return .loading }
            return results(query: previous, scope: scope, cap: cap, isRefining: true)
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

    private func apply(_ event: SearchProviderEvent<Provider.Hit>, query: String) {
        switch event {
        case .results(let results):
            hits = results
            answeredQuery = query
            answer = .current
        case .failed:
            answer = .failed
        case .offline:
            answer = .offline
        case .notOnPhone:
            answer = .notOnPhone
        }
    }

    private func results(
        query: String, scope: SearchScope, cap: Int, isRefining: Bool
    ) -> SearchSectionState<Provider.Hit>? {
        guard !hits.isEmpty else { return nil }
        let rows = scope == .all ? Array(hits.prefix(max(cap, 0))) : hits
        return .results(rows: rows, total: hits.count, query: query, isRefining: isRefining)
    }

    private struct Request {
        let query: String
        let filter: Provider.Filter
    }
}
