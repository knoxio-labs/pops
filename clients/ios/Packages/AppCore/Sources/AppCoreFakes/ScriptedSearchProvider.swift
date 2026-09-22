import AppCore
import Foundation

/// One delayed event emitted by ``ScriptedSearchProvider``.
public struct ScriptedSearchStep<Hit: Sendable>: Sendable {
    public let event: SearchProviderEvent<Hit>
    public let delay: Duration

    /// Creates a scripted event after an optional delay.
    public init(event: SearchProviderEvent<Hit>, delay: Duration = .zero) {
        self.event = event
        self.delay = delay
    }
}

/// A deterministic search provider that records asks and stream termination.
public actor ScriptedSearchProvider<Hit: Sendable, Filter: Sendable>: SearchProvider {
    public nonisolated let pillar: SearchPillar
    public nonisolated let debounce: Duration

    private var scripts: [String: [[ScriptedSearchStep<Hit>]]]
    private var asked: [String] = []
    private var filters: [Filter] = []
    private var terminated: [String] = []

    /// Creates a provider with one queued script per request for each query.
    public init(
        pillar: SearchPillar,
        debounce: Duration = .zero,
        scripts: [String: [[ScriptedSearchStep<Hit>]]] = [:]
    ) {
        self.pillar = pillar
        self.debounce = debounce
        self.scripts = scripts
    }

    /// Adds the next script consumed by a query.
    public func enqueue(_ steps: [ScriptedSearchStep<Hit>], for query: String) {
        scripts[query, default: []].append(steps)
    }

    /// The queries providers were asked, in call order.
    public func askedQueries() -> [String] { asked }

    /// The filters providers were asked with, in call order.
    public func askedFilters() -> [Filter] { filters }

    /// Queries whose streams ended or were cancelled, in termination order.
    public func terminatedQueries() -> [String] { terminated }

    nonisolated public func answers(
        to query: String, filter: Filter
    ) -> AsyncStream<SearchProviderEvent<Hit>> {
        AsyncStream { continuation in
            let delivery = Task {
                await self.deliver(query, filter: filter, continuation: continuation)
            }
            continuation.onTermination = { _ in
                delivery.cancel()
                Task { await self.recordTermination(query) }
            }
        }
    }

    private func deliver(
        _ query: String,
        filter: Filter,
        continuation: AsyncStream<SearchProviderEvent<Hit>>.Continuation
    ) async {
        asked.append(query)
        filters.append(filter)
        var queued = scripts[query] ?? []
        let steps = queued.isEmpty ? [] : queued.removeFirst()
        scripts[query] = queued

        for step in steps {
            if step.delay > .zero {
                do {
                    try await Task.sleep(for: step.delay)
                } catch {
                    return
                }
            }
            guard !Task.isCancelled else { return }
            continuation.yield(step.event)
        }
        continuation.finish()
    }

    private func recordTermination(_ query: String) {
        terminated.append(query)
    }
}
