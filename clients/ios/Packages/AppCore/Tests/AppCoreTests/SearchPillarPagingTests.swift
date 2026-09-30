import AppCoreFakes
import Foundation
import Testing

@testable import AppCore

@Suite("Search pillar page requests")
@MainActor
internal struct SearchPillarPagingTests {
    @Test("a delayed page from a superseded query cannot append to its replacement")
    func supersededPageIsCancelled() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "old": [
                    [SearchTest.step(.results(SearchTest.page([1], nextCursor: "next")))],
                    [SearchTest.step(.results(SearchTest.page([2])), after: .milliseconds(80))],
                ],
                "new": [[SearchTest.step(.results(SearchTest.page([3])))]],
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

    @Test("only the first page is requested until the visible end boundary arrives")
    func waitsForBoundaryBeforeRequestingNextPage() async {
        let provider = Provider(
            pillar: .inventory,
            scripts: [
                "tool": [
                    [SearchTest.step(.results(SearchTest.page([1], nextCursor: "next")))],
                    [SearchTest.step(.results(SearchTest.page([2])))],
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
                    [
                        SearchTest.step(
                            .results(SearchTest.page([1], nextCursor: "next", totalCount: 2)))
                    ],
                    [SearchTest.step(.results(SearchTest.page([2], totalCount: 2)))],
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
                    [SearchTest.step(.results(SearchTest.page([1], nextCursor: "next")))],
                    [SearchTest.step(.failed)],
                    [SearchTest.step(.results(SearchTest.page([2])))],
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
                    [SearchTest.step(.results(SearchTest.page([1, 1], nextCursor: "a")))],
                    [SearchTest.step(.results(SearchTest.page([1, 1], nextCursor: "b")))],
                    [SearchTest.step(.results(SearchTest.page([2, 2])))],
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
                    [SearchTest.step(.results(SearchTest.page([], nextCursor: "a")))],
                    [SearchTest.step(.results(SearchTest.page([], nextCursor: "b")))],
                    [SearchTest.step(.results(SearchTest.page([3])))],
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
                    [SearchTest.step(.results(SearchTest.page([1], nextCursor: "a")))],
                    [SearchTest.step(.results(SearchTest.page([2], nextCursor: "a")))],
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

    private typealias Hit = SearchPillarTestHit
    private typealias Provider = SearchPillarTestProvider
}
