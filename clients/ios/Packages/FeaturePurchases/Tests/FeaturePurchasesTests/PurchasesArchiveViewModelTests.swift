import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases archive model")
@MainActor
internal struct PurchasesArchiveViewModelTests {
    @Test("the first page populates the all scope")
    func loadsFirstPage() async {
        let row = Purchase.fake(id: "all-row")
        let repository = ArchiveRepository([.immediate(Self.page([row], total: 12))])
        let model = makeModel(repository)

        await model.loadFirstPageIfNeeded()

        #expect(model.purchases == [row])
        #expect(model.totalCount == 12)
        #expect(model.topLevelState == .loaded)
        #expect(model.paging == .end)
    }

    @Test("only rows near the loaded tail request another page")
    func prefetchBoundary() async {
        let rows = (0..<8).map { Purchase.fake(id: "row-\($0)") }
        let repository = ArchiveRepository([
            .immediate(Self.page(rows, cursor: "next", total: 10)),
            .immediate(Self.page([.fake(id: "later")])),
        ])
        let model = makeModel(repository)

        await model.loadFirstPageIfNeeded()

        #expect(model.paging == .idle)
        #expect(!model.shouldPrefetch(when: "row-2"))
        #expect(model.shouldPrefetch(when: "row-3"))
        await model.loadNextPageIfNeeded(when: "row-2")
        #expect(await repository.calls().count == 1)

        await model.loadNextPageIfNeeded(when: "row-3")

        #expect(
            await repository.calls() == [
                .init(cursor: nil, filter: .all),
                .init(cursor: "next", filter: .all),
            ])
        #expect(model.purchases.last?.id == "later")
    }

    @Test("concurrent tail appearances request one page")
    func repeatedTailTriggersShareOneRequest() async {
        let gate = ArchiveGate()
        let repository = ArchiveRepository([
            .immediate(
                Self.page([.fake(id: "first"), .fake(id: "last")], cursor: "next", total: 3)),
            .gated(gate, Self.page([.fake(id: "later")])),
        ])
        let model = makeModel(repository)
        await model.loadFirstPageIfNeeded()

        let first = Task { await model.loadNextPageIfNeeded(when: "last") }
        await repository.waitForCalls(2)
        await model.loadNextPageIfNeeded(when: "first")

        #expect(await repository.calls().count == 2)
        await gate.open()
        await first.value
        #expect(model.purchases.map(\.id) == ["first", "last", "later"])
    }

    @Test("a cancelled page cannot land after its row leaves the viewport")
    func cancelledNextPageDoesNotLand() async {
        let gate = ArchiveGate()
        let repository = ArchiveRepository([
            .immediate(Self.page([.fake(id: "first")], cursor: "next", total: 3)),
            .gated(gate, Self.page([.fake(id: "stale")])),
            .immediate(Self.page([.fake(id: "fresh")])),
        ])
        let model = makeModel(repository)
        await model.loadFirstPageIfNeeded()

        let loading = Task { await model.loadNextPageIfNeeded() }
        await repository.waitForCalls(2)
        loading.cancel()
        await gate.open()
        await loading.value

        #expect(model.purchases.map(\.id) == ["first"])
        #expect(model.paging == .idle)
        await model.loadNextPageIfNeeded()
        #expect(model.purchases.map(\.id) == ["first", "fresh"])
        #expect(await repository.calls().map(\.cursor) == [nil, "next", "next"])
    }

    @Test("scope changes fetch once with the matching filter and cache each scope")
    func scopeChangesUseFilteredCache() async {
        let repository = ArchiveRepository([
            .immediate(Self.page([.fake(id: "all")], total: 2)),
            .immediate(Self.page([.fake(id: "open")], total: 1)),
        ])
        let model = makeModel(repository)

        await model.loadFirstPageIfNeeded()
        await model.setScope(.unmatched)
        await model.setScope(.all)

        #expect(
            await repository.calls() == [
                .init(cursor: nil, filter: .all),
                .init(cursor: nil, filter: .unsettled),
            ])
        #expect(model.purchases.map(\.id) == ["all"])
    }

    @Test("a next-page failure keeps rows and belongs to the footer")
    func nextPageFailureKeepsRows() async {
        let row = Purchase.fake(id: "kept")
        let later = Purchase.fake(id: "later")
        let repository = ArchiveRepository([
            .immediate(Self.page([row], cursor: "next", total: 4)),
            .failure(.unavailable),
            .immediate(Self.page([later])),
        ])
        let model = makeModel(repository)
        await model.loadFirstPageIfNeeded()

        await model.loadNextPageIfNeeded()

        #expect(model.purchases == [row])
        #expect(model.topLevelState == .loaded)
        #expect(model.paging == .failed)
        #expect(model.nextPageCursor == "next")

        await model.retryNextPage()

        #expect(model.purchases == [row, later])
        #expect(await repository.calls().map(\.cursor) == [nil, "next", "next"])
    }

    @Test("retry is a no-op unless the footer failed")
    func retryGuard() async {
        let loadingRepository = ArchiveRepository([
            .immediate(Self.page([.fake()], cursor: "next", total: 2))
        ])
        let loading = makeModel(loadingRepository)
        await loading.loadFirstPageIfNeeded()
        await loading.retryNextPage()
        #expect(await loadingRepository.calls().count == 1)

        let endRepository = ArchiveRepository([.immediate(Self.page([.fake()], total: 1))])
        let end = makeModel(endRepository)
        await end.loadFirstPageIfNeeded()
        await end.retryNextPage()
        #expect(await endRepository.calls().count == 1)
    }

    @Test("later pages dedupe identifiers and preserve the first-page count")
    func dedupesAndPreservesCount() async {
        let first = Purchase.fake(id: "first")
        let duplicate = Purchase.fake(id: "duplicate")
        let later = Purchase.fake(id: "later")
        let repository = ArchiveRepository([
            .immediate(Self.page([first, duplicate], cursor: "next", total: 9)),
            .immediate(Self.page([duplicate, later])),
        ])
        let model = makeModel(repository)

        await model.loadFirstPageIfNeeded()
        await model.loadNextPageIfNeeded()

        #expect(model.purchases.map(\.id) == ["first", "duplicate", "later"])
        #expect(model.totalCount == 9)
    }

    @Test("a duplicate-only page advances the footer cursor without adding rows")
    func duplicateOnlyPageAdvancesCursor() async {
        let first = Purchase.fake(id: "first")
        let repository = ArchiveRepository([
            .immediate(Self.page([first], cursor: "second", total: 2)),
            .immediate(Self.page([first], cursor: "third")),
            .immediate(Self.page([.fake(id: "last")])),
        ])
        let model = makeModel(repository)
        await model.loadFirstPageIfNeeded()
        #expect(model.nextPageCursor == "second")

        await model.loadNextPageIfNeeded()
        #expect(model.purchases == [first])
        #expect(model.nextPageCursor == "third")
        #expect(model.paging == .idle)

        await model.loadNextPageIfNeeded()
        #expect(model.purchases.map(\.id) == ["first", "last"])
        #expect(model.nextPageCursor == nil)
        #expect(model.paging == .end)
    }

    @Test("a repeated cursor stops automatic paging and can be retried explicitly")
    func repeatedCursorWaitsForRetry() async {
        let repository = ArchiveRepository([
            .immediate(Self.page([.fake(id: "first")], cursor: "same", total: 3)),
            .immediate(Self.page([.fake(id: "later")], cursor: "same")),
            .immediate(Self.page([], total: 3)),
        ])
        let model = makeModel(repository)
        await model.loadFirstPageIfNeeded()
        await model.loadNextPageIfNeeded()

        #expect(model.purchases.map(\.id) == ["first", "later"])
        #expect(model.nextPageCursor == "same")
        #expect(model.paging == .failed)
        await model.loadNextPageIfNeeded(when: "later")
        #expect(await repository.calls().count == 2)

        await model.retryNextPage()

        #expect(await repository.calls().map(\.cursor) == [nil, "same", "same"])
        #expect(model.paging == .end)
    }

    @Test("month incompleteness follows each scope's own cursor")
    func incompletenessIsPerScope() async {
        let repository = ArchiveRepository([
            .immediate(
                Self.page(
                    [Self.purchase("all-new", month: 9), Self.purchase("all-old", month: 8)],
                    cursor: "more", total: 3)),
            .immediate(
                Self.page([Self.purchase("open", month: 9, status: .awaitingSettlement)], total: 1)),
        ])
        let model = makeModel(repository)

        await model.loadFirstPageIfNeeded()
        #expect(model.months.last?.isIncomplete == true)
        await model.setScope(.unmatched)
        #expect(model.months.last?.isIncomplete == false)
    }

    @Test("a cancelled first page can be requested again")
    func cancellationDoesNotStrandFirstPage() async {
        let row = Purchase.fake(id: "after-cancel")
        let repository = ArchiveRepository([
            .cancelled,
            .immediate(Self.page([row], total: 1)),
        ])
        let model = makeModel(repository)

        await model.loadFirstPageIfNeeded()
        await model.loadFirstPageIfNeeded()

        #expect(model.purchases == [row])
        #expect(await repository.calls().count == 2)
    }

    @Test("switching away and back discards a stale page without stranding paging")
    func scopeSwitchDiscardsStalePage() async {
        let staleGate = ArchiveGate()
        let repository = ArchiveRepository([
            .immediate(Self.page([.fake(id: "first")], cursor: "next", total: 3)),
            .gated(staleGate, Self.page([.fake(id: "stale")])),
            .immediate(Self.page([.fake(id: "open")], total: 1)),
            .immediate(Self.page([.fake(id: "fresh")], total: 3)),
        ])
        let model = makeModel(repository)
        await model.loadFirstPageIfNeeded()

        let stale = Task { await model.loadNextPageIfNeeded() }
        await repository.waitForCalls(2)
        await model.setScope(.unmatched)
        await model.setScope(.all)
        await model.loadNextPageIfNeeded()
        await staleGate.open()
        await stale.value

        #expect(model.purchases.map(\.id) == ["first", "fresh"])
        #expect(model.paging == .end)
    }

    @Test("switching scopes preserves a settled paging failure until explicit retry")
    func scopeSwitchPreservesPagingFailure() async {
        let repository = ArchiveRepository([
            .immediate(Self.page([.fake(id: "all")], cursor: "next", total: 2)),
            .failure(.unavailable),
            .immediate(Self.page([.fake(id: "open")], total: 1)),
            .immediate(Self.page([.fake(id: "retried")], total: 2)),
        ])
        let model = makeModel(repository)
        await model.loadFirstPageIfNeeded()
        await model.loadNextPageIfNeeded()

        await model.setScope(.unmatched)
        await model.setScope(.all)
        await model.loadNextPageIfNeeded()

        #expect(model.paging == .failed)
        #expect(await repository.calls().count == 3)
        await model.retryNextPage()
        #expect(model.purchases.map(\.id) == ["all", "retried"])
    }

    private func makeModel(_ repository: ArchiveRepository) -> PurchasesArchiveViewModel {
        PurchasesArchiveViewModel(dependencies: .fake(purchases: repository))
    }

    private static func page(
        _ rows: [Purchase], cursor: String? = nil, total: Int? = nil
    ) -> PurchasePage {
        PurchasePage(purchases: rows, nextCursor: cursor, totalCount: total)
    }

    private static func purchase(
        _ id: String, month: Int, status: PurchaseSettlement = .linked
    ) -> Purchase {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        let date =
            calendar.date(from: DateComponents(year: 2026, month: month, day: 10))
            ?? .distantPast
        return .fake(id: id, orderedOn: date, status: status)
    }
}
