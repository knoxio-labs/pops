import AppCoreFakes
import Testing

@testable import AppCore

@Suite("Search pillar paging")
@MainActor
internal struct SearchPillarModelTests {
    @Test("an empty query clears rows without asking the provider")
    func emptyQueryDoesNotAsk() async {
        let provider = Provider(pillar: .inventory)
        let model = SearchPillarModel(provider: provider)

        model.ask("  ", filter: "all")

        #expect(await provider.askedQueries().isEmpty)
        #expect(model.answer == .current)
        #expect(model.hits.isEmpty)
        #expect(model.answeredQuery.isEmpty)
    }

    @Test("zero debounce asks immediately")
    func zeroDebounce() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: ["cable": [[Self.step(.results(Self.page([1])))]]])
        let model = SearchPillarModel(provider: provider)

        model.ask(" cable ", filter: "all")

        #expect(await eventually { await provider.askedQueries() == ["cable"] })
        #expect(await eventually { model.hits == [Hit(1)] })
    }

    @Test("debounce sends only the last query in a burst")
    func debounceBurst() async {
        let provider = Provider(
            pillar: .purchases,
            debounce: .milliseconds(40),
            scripts: ["tool": [[Self.step(.results(Self.page([3])))]]])
        let model = SearchPillarModel(provider: provider)

        model.ask("t", filter: "all")
        model.ask("to", filter: "all")
        model.ask("tool", filter: "all")

        #expect(await eventually { await provider.askedQueries() == ["tool"] })
        #expect(await eventually { model.hits == [Hit(3)] })
    }

    @Test("a superseded stream terminates and cannot overwrite the latest answer")
    func supersededResponse() async throws {
        let provider = Provider(
            pillar: .purchases,
            scripts: [
                "old": [[Self.step(.results(Self.page([1])), after: .milliseconds(80))]],
                "new": [[Self.step(.results(Self.page([2])))]],
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("old", filter: "all")
        #expect(await eventually { await provider.askedQueries().contains("old") })

        model.ask("new", filter: "all")
        #expect(model.hits.isEmpty)
        #expect(await eventually { model.hits == [Hit(2)] })
        try await Task.sleep(for: .milliseconds(100))

        #expect(model.hits == [Hit(2)])
        #expect(model.answeredQuery == "new")
        #expect(await eventually { await provider.terminatedQueries().contains("old") })
    }

    @Test("changing a filter clears old rows and rejects its delayed page")
    func filterRace() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "cable": [
                    [Self.step(.results(Self.page([1])), after: .milliseconds(80))],
                    [Self.step(.results(Self.page([2])))],
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("cable", filter: "old")
        #expect(await eventually { await provider.askedQueries() == ["cable"] })

        model.ask("cable", filter: "new")

        #expect(model.hits.isEmpty)
        #expect(await eventually { model.hits == [Hit(2)] })
        #expect(await provider.askedFilters() == ["old", "new"])
    }

    @Test("a delayed page from a superseded query cannot append to its replacement")
    func supersededPageIsCancelled() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "old": [
                    [Self.step(.results(Self.page([1], nextCursor: "next")))],
                    [Self.step(.results(Self.page([2])), after: .milliseconds(80))],
                ],
                "new": [[Self.step(.results(Self.page([3])))]],
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("old", filter: "all")
        #expect(await eventually { model.hits == [Hit(1)] })

        let pageTask = Task { await model.loadNextPageIfNeeded() }
        #expect(await eventually { await provider.askedCursors() == [nil, "next"] })

        model.ask("new", filter: "all")

        #expect(model.hits.isEmpty)
        #expect(await eventually { model.hits == [Hit(3)] })
        await pageTask.value
        #expect(model.hits == [Hit(3)])
    }

    @Test("retry repeats the same query and filter after a first-page failure")
    func retryFailure() async {
        let provider = Provider(
            pillar: .purchases,
            scripts: ["tool": [[Self.step(.failed)], [Self.step(.results(Self.page([7])))]]])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "unsettled")
        #expect(await eventually { model.answer == SearchAnswer.failed })

        model.retry()

        #expect(await eventually { model.hits == [Hit(7)] })
        #expect(await provider.askedQueries() == ["tool", "tool"])
        #expect(await provider.askedFilters() == ["unsettled", "unsettled"])
    }

    @Test("a refreshed first page replaces its prior ordered matches")
    func firstPageRefreshReplacesRows() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [
                        Self.step(.results(Self.page([1], nextCursor: "next"))),
                        Self.step(
                            .results(Self.page([2], nextCursor: "next")), after: .milliseconds(20)),
                    ]
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "all")

        #expect(await eventually { model.hits == [Hit(2)] })
        #expect(await provider.askedCursors() == [nil])
    }

    @Test("only the first page is requested until the visible end boundary arrives")
    func waitsForBoundaryBeforeRequestingNextPage() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [Self.step(.results(Self.page([1], nextCursor: "next")))],
                    [Self.step(.results(Self.page([2])))],
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "all")
        #expect(await eventually { model.hits == [Hit(1)] })
        #expect(await provider.askedCursors() == [nil])

        await model.loadNextPageIfNeeded()

        #expect(model.hits == [Hit(1), Hit(2)])
        #expect(await provider.askedCursors() == [nil, "next"])
        #expect(await provider.askedLimits() == [20, 20])
    }

    @Test("a later page makes results beyond the first page reachable")
    func laterPageResultsAreReachable() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [Self.step(.results(Self.page([1], nextCursor: "next", totalCount: 2)))],
                    [Self.step(.results(Self.page([2], totalCount: 2)))],
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "all")
        #expect(await eventually { model.hits == [Hit(1)] })

        await model.loadNextPageIfNeeded()

        #expect(model.hits == [Hit(1), Hit(2)])
        #expect(model.totalCount == 2)
        #expect(model.pagingState == .exhausted)
    }

    @Test("a next-page failure preserves rows and retries its cursor")
    func nextPageFailureRetriesSameCursor() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [Self.step(.results(Self.page([1], nextCursor: "next")))],
                    [Self.step(.failed)],
                    [Self.step(.results(Self.page([2])))],
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "all")
        #expect(await eventually { model.hits == [Hit(1)] })
        await model.loadNextPageIfNeeded()

        #expect(model.hits == [Hit(1)])
        #expect(model.pagingState == .failed)

        await model.retryNextPage()

        #expect(model.hits == [Hit(1), Hit(2)])
        #expect(await provider.askedCursors() == [nil, "next", "next"])
    }

    @Test("short duplicate-only pages advance until a new row or the end")
    func duplicateOnlyPagesAdvanceAutomatically() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [Self.step(.results(Self.page([1, 1], nextCursor: "a")))],
                    [Self.step(.results(Self.page([1, 1], nextCursor: "b")))],
                    [Self.step(.results(Self.page([2, 2])))],
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "all")
        #expect(await eventually { model.hits == [Hit(1)] })

        await model.loadNextPageIfNeeded()

        #expect(model.hits == [Hit(1), Hit(2)])
        #expect(await provider.askedCursors() == [nil, "a", "b"])
    }

    @Test("an empty first page automatically follows cursors until rows arrive")
    func emptyFirstPageAdvancesAutomatically() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [Self.step(.results(Self.page([], nextCursor: "a")))],
                    [Self.step(.results(Self.page([], nextCursor: "b")))],
                    [Self.step(.results(Self.page([3])))],
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "all")

        #expect(await eventually { model.hits == [Hit(3)] })
        #expect(await provider.askedCursors() == [nil, "a", "b"])
    }

    @Test("a repeated cursor stops paging with a retryable error")
    func repeatedCursorStops() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [Self.step(.results(Self.page([1], nextCursor: "a")))],
                    [Self.step(.results(Self.page([2], nextCursor: "a")))],
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "all")
        #expect(await eventually { model.hits == [Hit(1)] })

        await model.loadNextPageIfNeeded()

        #expect(model.hits == [Hit(1)])
        #expect(model.pagingState == .failed)
        #expect(await provider.askedCursors() == [nil, "a"])
    }

    @Test("All displays every loaded match and scoped sections stay complete")
    func sectionShaping() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: ["item": [[Self.step(.results(Self.page([1, 2, 3, 4, 5])))]]])
        let model = SearchPillarModel(provider: provider)
        model.ask("item", filter: "all")
        #expect(await eventually { model.hits.count == 5 })

        #expect(
            model.section(scope: .all)
                == .results(
                    rows: [Hit(1), Hit(2), Hit(3), Hit(4), Hit(5)], total: 5,
                    query: "item", isRefining: false))
        #expect(model.section(scope: .pillar(.purchases)) == nil)
    }

    @Test("availability statuses survive an empty query while transient statuses do not")
    func chipStatusForEmptyQuery() {
        #expect(
            SearchPillarModel<Provider>.chipStatus(
                answer: .offline, hitCount: 0, query: "") == .offline)
        #expect(
            SearchPillarModel<Provider>.chipStatus(
                answer: .notOnPhone, hitCount: 0, query: "") == .notOnPhone)
        #expect(
            SearchPillarModel<Provider>.chipStatus(
                answer: .failed, hitCount: 0, query: "") == .none)
        #expect(
            SearchPillarModel<Provider>.chipStatus(
                answer: .pending(previous: nil), hitCount: 0, query: "") == .none)
    }

    private struct Hit: Identifiable, Sendable, Equatable {
        let id: Int

        init(_ id: Int) { self.id = id }
    }

    private typealias Provider = ScriptedSearchProvider<Hit, String>

    private static func page(
        _ ids: [Int], nextCursor: String? = nil, totalCount: Int? = nil
    ) -> SearchProviderPage<Hit> {
        SearchProviderPage(
            hits: ids.map(Hit.init), nextCursor: nextCursor, totalCount: totalCount)
    }

    private static func step(
        _ event: SearchProviderEvent<Hit>, after delay: Duration = .zero
    ) -> ScriptedSearchStep<Hit> {
        ScriptedSearchStep(event: event, delay: delay)
    }

    private func eventually(
        _ condition: @escaping @MainActor () async -> Bool
    ) async -> Bool {
        for _ in 0..<100 {
            if await condition() { return true }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return false
    }
}
