import AppCore
import AppCoreFakes
import Testing

@testable import FeaturePurchases

@Suite("Purchases archive next-page behavior")
@MainActor
internal struct PurchasesArchiveNextPageTests {
    private typealias ArchiveTest = PurchasesArchiveTestFactory

    @Test("only rows near the loaded tail request another page")
    func prefetchBoundary() async {
        let rows = (0..<8).map { Purchase.fake(id: "row-\($0)") }
        let repository = ArchiveRepository([
            .immediate(ArchiveTest.page(rows, cursor: "next", total: 10)),
            .immediate(ArchiveTest.page([.fake(id: "later")])),
        ])
        let model = ArchiveTest.model(repository)

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
                ArchiveTest.page([.fake(id: "first"), .fake(id: "last")], cursor: "next", total: 3)),
            .gated(gate, ArchiveTest.page([.fake(id: "later")])),
        ])
        let model = ArchiveTest.model(repository)
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
            .immediate(ArchiveTest.page([.fake(id: "first")], cursor: "next", total: 3)),
            .gated(gate, ArchiveTest.page([.fake(id: "stale")])),
            .immediate(ArchiveTest.page([.fake(id: "fresh")])),
        ])
        let model = ArchiveTest.model(repository)
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

    @Test("a next-page failure keeps rows and belongs to the footer")
    func nextPageFailureKeepsRows() async {
        let row = Purchase.fake(id: "kept")
        let later = Purchase.fake(id: "later")
        let repository = ArchiveRepository([
            .immediate(ArchiveTest.page([row], cursor: "next", total: 4)),
            .failure(.unavailable),
            .immediate(ArchiveTest.page([later])),
        ])
        let model = ArchiveTest.model(repository)
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
}
