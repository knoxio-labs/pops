import AppCoreFakes
import Testing

@testable import AppCore

@Suite("Search pillar phase machine")
@MainActor
internal struct SearchPillarModelTests {
    @Test("an empty query clears rows without asking the provider")
    func emptyQueryDoesNotAsk() async {
        let provider = Provider(pillar: .inventory)
        let model = SearchPillarModel(provider: provider)

        model.ask("  ", filter: "all")
        await Task.yield()

        #expect(await provider.askedQueries().isEmpty)
        #expect(model.answer == .current)
        #expect(model.hits.isEmpty)
        #expect(model.answeredQuery.isEmpty)
    }

    @Test("zero debounce asks immediately")
    func zeroDebounce() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: ["cable": [[Self.step(.results([1]))]]])
        let model = SearchPillarModel(provider: provider)

        model.ask(" cable ", filter: "all")

        #expect(await eventually { await provider.askedQueries() == ["cable"] })
        #expect(await eventually { model.hits == [1] })
    }

    @Test("debounce sends only the last query in a burst")
    func debounceBurst() async {
        let provider = Provider(
            pillar: .purchases,
            debounce: .milliseconds(40),
            scripts: ["tool": [[Self.step(.results([3]))]]])
        let model = SearchPillarModel(provider: provider)

        model.ask("t", filter: "all")
        model.ask("to", filter: "all")
        model.ask("tool", filter: "all")

        #expect(await eventually { await provider.askedQueries() == ["tool"] })
        #expect(await eventually { model.hits == [3] })
    }

    @Test("a superseded stream terminates and cannot overwrite the latest answer")
    func supersededResponse() async throws {
        let provider = Provider(
            pillar: .purchases,
            scripts: [
                "old": [[Self.step(.results([1]), after: .milliseconds(80))]],
                "new": [[Self.step(.results([2]))]],
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("old", filter: "all")
        #expect(await eventually { await provider.askedQueries().contains("old") })

        model.ask("new", filter: "all")
        #expect(await eventually { model.hits == [2] })
        try await Task.sleep(for: .milliseconds(100))

        #expect(model.hits == [2])
        #expect(model.answeredQuery == "new")
        #expect(await eventually { await provider.terminatedQueries().contains("old") })
    }

    @Test("refining retains the previous rows and query")
    func refiningPreviousRows() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "cab": [[Self.step(.results([1, 2]))]],
                "cable": [[Self.step(.results([3]), after: .milliseconds(80))]],
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("cab", filter: "all")
        #expect(await eventually { model.hits == [1, 2] })

        model.ask("cable", filter: "all")

        #expect(model.answer == SearchAnswer.pending(previous: "cab"))
        #expect(
            model.section(scope: SearchScope.all, cap: 3)
                == .results(rows: [1, 2], total: 2, query: "cab", isRefining: true))
    }

    @Test("retry repeats the same query and filter after failure")
    func retryFailure() async {
        let provider = Provider(
            pillar: .purchases,
            scripts: [
                "tool": [
                    [Self.step(.failed)],
                    [Self.step(.results([7]))],
                ]
            ])
        let model = SearchPillarModel(provider: provider)
        model.ask("tool", filter: "unsettled")
        #expect(await eventually { model.answer == SearchAnswer.failed })

        model.retry()

        #expect(await eventually { model.hits == [7] })
        #expect(await provider.askedQueries() == ["tool", "tool"])
        #expect(await provider.askedFilters() == ["unsettled", "unsettled"])
    }

    @Test("one on-device stream can update its rows without another ask")
    func streamingUpdates() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "cable": [
                    [
                        Self.step(.results([1])),
                        Self.step(.results([1, 2]), after: .milliseconds(20)),
                    ]
                ]
            ])
        let model = SearchPillarModel(provider: provider)

        model.ask("cable", filter: "all")

        #expect(await eventually { model.hits == [1, 2] })
        #expect(await provider.askedQueries() == ["cable"])
    }

    @Test("All caps rows while a scoped section keeps the complete answer")
    func sectionShaping() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: ["item": [[Self.step(.results([1, 2, 3, 4, 5]))]]])
        let model = SearchPillarModel(provider: provider)
        model.ask("item", filter: "all")
        #expect(await eventually { model.hits.count == 5 })

        #expect(
            model.section(scope: SearchScope.all, cap: 3)
                == .results(
                    rows: [1, 2, 3], total: 5, query: "item", isRefining: false))
        #expect(
            model.section(scope: SearchScope.pillar(.inventory), cap: 3)
                == .results(
                    rows: [1, 2, 3, 4, 5], total: 5, query: "item", isRefining: false))
        #expect(model.section(scope: SearchScope.pillar(.purchases), cap: 3) == nil)
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

    private typealias Provider = ScriptedSearchProvider<Int, String>

    private static func step(
        _ event: SearchProviderEvent<Int>, after delay: Duration = .zero
    ) -> ScriptedSearchStep<Int> {
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
