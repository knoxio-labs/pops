import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases archive model")
@MainActor
internal struct PurchasesArchiveViewModelTests {
    private typealias ArchiveTest = PurchasesArchiveTestFactory

    @Test("the first page populates the all scope")
    func loadsFirstPage() async {
        let row = Purchase.fake(id: "all-row")
        let repository = ArchiveRepository([.immediate(ArchiveTest.page([row], total: 12))])
        let model = ArchiveTest.model(repository)

        await model.loadFirstPageIfNeeded()

        #expect(model.purchases == [row])
        #expect(model.totalCount == 12)
        #expect(model.topLevelState == .loaded)
        #expect(model.paging == .end)
    }

    @Test("scope changes fetch once with the matching filter and cache each scope")
    func scopeChangesUseFilteredCache() async {
        let repository = ArchiveRepository([
            .immediate(ArchiveTest.page([.fake(id: "all")], total: 2)),
            .immediate(ArchiveTest.page([.fake(id: "open")], total: 1)),
        ])
        let model = ArchiveTest.model(repository)

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

    @Test("retry is a no-op unless the footer failed")
    func retryGuard() async {
        let loadingRepository = ArchiveRepository([
            .immediate(ArchiveTest.page([.fake()], cursor: "next", total: 2))
        ])
        let loading = ArchiveTest.model(loadingRepository)
        await loading.loadFirstPageIfNeeded()
        await loading.retryNextPage()
        #expect(await loadingRepository.calls().count == 1)

        let endRepository = ArchiveRepository([.immediate(ArchiveTest.page([.fake()], total: 1))])
        let end = ArchiveTest.model(endRepository)
        await end.loadFirstPageIfNeeded()
        await end.retryNextPage()
        #expect(await endRepository.calls().count == 1)
    }

    @Test("month incompleteness follows each scope's own cursor")
    func incompletenessIsPerScope() async {
        let repository = ArchiveRepository([
            .immediate(
                ArchiveTest.page(
                    [
                        ArchiveTest.purchase("all-new", month: 9),
                        ArchiveTest.purchase("all-old", month: 8),
                    ],
                    cursor: "more", total: 3)),
            .immediate(
                ArchiveTest.page(
                    [ArchiveTest.purchase("open", month: 9, status: .awaitingSettlement)], total: 1)
            ),
        ])
        let model = ArchiveTest.model(repository)

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
            .immediate(ArchiveTest.page([row], total: 1)),
        ])
        let model = ArchiveTest.model(repository)

        await model.loadFirstPageIfNeeded()
        await model.loadFirstPageIfNeeded()

        #expect(model.purchases == [row])
        #expect(await repository.calls().count == 2)
    }

    @Test("switching away and back discards a stale page without stranding paging")
    func scopeSwitchDiscardsStalePage() async {
        let staleGate = ArchiveGate()
        let repository = ArchiveRepository([
            .immediate(ArchiveTest.page([.fake(id: "first")], cursor: "next", total: 3)),
            .gated(staleGate, ArchiveTest.page([.fake(id: "stale")])),
            .immediate(ArchiveTest.page([.fake(id: "open")], total: 1)),
            .immediate(ArchiveTest.page([.fake(id: "fresh")], total: 3)),
        ])
        let model = ArchiveTest.model(repository)
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
}
