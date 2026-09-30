import AppCore

/// One delayed event emitted by ``ScriptedSearchProvider``.
public struct ScriptedSearchStep<Hit: Sendable>: Sendable {
    /// The event emitted after the optional delay.
    public let event: SearchProviderEvent<Hit>
    /// Time to wait before emitting the event.
    public let delay: Duration

    /// Creates a scripted event after an optional delay.
    public init(event: SearchProviderEvent<Hit>, delay: Duration = .zero) {
        self.event = event
        self.delay = delay
    }
}

/// A deterministic search provider that records page asks and stream termination.
public actor ScriptedSearchProvider<Hit: Identifiable & Sendable, Filter: Equatable & Sendable>:
    SearchProvider
where Hit.ID: Hashable & Sendable {
    public nonisolated let pillar: SearchPillar
    public nonisolated let debounce: Duration

    private var scripts: [String: [[ScriptedSearchStep<Hit>]]]
    private var asked: [String] = []
    private var filters: [Filter] = []
    private var cursors: [String?] = []
    private var limits: [Int] = []
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

    /// Adds the next script consumed by a query page request.
    public func enqueue(_ steps: [ScriptedSearchStep<Hit>], for query: String) {
        scripts[query, default: []].append(steps)
    }

    /// The queries requested, in call order.
    public func askedQueries() -> [String] { asked }

    /// The filters requested, in call order.
    public func askedFilters() -> [Filter] { filters }

    /// The cursors requested, in call order.
    public func askedCursors() -> [String?] { cursors }

    /// The page sizes requested, in call order.
    public func askedLimits() -> [Int] { limits }

    /// Queries whose streams ended or were cancelled, in termination order.
    public func terminatedQueries() -> [String] { terminated }

    nonisolated public func answers(
        to query: String, filter: Filter, after cursor: String?, limit: Int
    ) -> AsyncStream<SearchProviderEvent<Hit>> {
        AsyncStream { continuation in
            let delivery = Task {
                await self.deliver(
                    query, filter: filter, cursor: cursor, limit: limit,
                    continuation: continuation)
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
        cursor: String?,
        limit: Int,
        continuation: AsyncStream<SearchProviderEvent<Hit>>.Continuation
    ) async {
        asked.append(query)
        filters.append(filter)
        cursors.append(cursor)
        limits.append(limit)
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
