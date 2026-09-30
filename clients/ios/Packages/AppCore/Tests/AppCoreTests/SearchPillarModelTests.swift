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
            scripts: ["cable": [[SearchTest.step(.results(SearchTest.page([1])))]]])
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
            scripts: ["tool": [[SearchTest.step(.results(SearchTest.page([3])))]]])
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
                "old": [
                    [SearchTest.step(.results(SearchTest.page([1])), after: .milliseconds(80))]
                ],
                "new": [[SearchTest.step(.results(SearchTest.page([2])))]],
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
                    [SearchTest.step(.results(SearchTest.page([1])), after: .milliseconds(80))],
                    [SearchTest.step(.results(SearchTest.page([2])))],
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

    @Test("retry repeats the same query and filter after a first-page failure")
    func retryFailure() async {
        let provider = Provider(
            pillar: .purchases,
            scripts: [
                "tool": [
                    [SearchTest.step(.failed)], [SearchTest.step(.results(SearchTest.page([7])))],
                ]
            ])
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
                        SearchTest.step(.results(SearchTest.page([1], nextCursor: "next"))),
                        SearchTest.step(
                            .results(SearchTest.page([2], nextCursor: "next")),
                            after: .milliseconds(20)),
                    ]
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "all")

        #expect(await eventually { model.hits == [Hit(2)] })
        #expect(await provider.askedCursors() == [nil])
    }

    @Test("All displays every loaded match and scoped sections stay complete")
    func sectionShaping() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: ["item": [[SearchTest.step(.results(SearchTest.page([1, 2, 3, 4, 5])))]]])
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

    private typealias Hit = SearchPillarTestHit
    private typealias Provider = SearchPillarTestProvider
}
