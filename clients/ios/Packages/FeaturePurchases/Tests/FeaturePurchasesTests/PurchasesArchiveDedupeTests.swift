import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases archive cursor behavior")
@MainActor
internal struct PurchasesArchiveDedupeTests {
    private typealias ArchiveTest = PurchasesArchiveTestFactory

    @Test("later pages dedupe identifiers and preserve the first-page count")
    func dedupesAndPreservesCount() async {
        let first = Purchase.fake(id: "first")
        let duplicate = Purchase.fake(id: "duplicate")
        let later = Purchase.fake(id: "later")
        let repository = ArchiveRepository([
            .immediate(ArchiveTest.page([first, duplicate], cursor: "next", total: 9)),
            .immediate(ArchiveTest.page([duplicate, later])),
        ])
        let model = ArchiveTest.model(repository)

        await model.loadFirstPageIfNeeded()
        await model.loadNextPageIfNeeded()

        #expect(model.purchases.map(\.id) == ["first", "duplicate", "later"])
        #expect(model.totalCount == 9)
    }

    @Test("a duplicate-only page advances the footer cursor without adding rows")
    func duplicateOnlyPageAdvancesCursor() async {
        let first = Purchase.fake(id: "first")
        let repository = ArchiveRepository([
            .immediate(ArchiveTest.page([first], cursor: "second", total: 2)),
            .immediate(ArchiveTest.page([first], cursor: "third")),
            .immediate(ArchiveTest.page([.fake(id: "last")])),
        ])
        let model = ArchiveTest.model(repository)
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
            .immediate(ArchiveTest.page([.fake(id: "first")], cursor: "same", total: 3)),
            .immediate(ArchiveTest.page([.fake(id: "later")], cursor: "same")),
            .immediate(ArchiveTest.page([], total: 3)),
        ])
        let model = ArchiveTest.model(repository)
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

    @Test("switching scopes preserves a settled paging failure until explicit retry")
    func scopeSwitchPreservesPagingFailure() async {
        let repository = ArchiveRepository([
            .immediate(ArchiveTest.page([.fake(id: "all")], cursor: "next", total: 2)),
            .failure(.unavailable),
            .immediate(ArchiveTest.page([.fake(id: "open")], total: 1)),
            .immediate(ArchiveTest.page([.fake(id: "retried")], total: 2)),
        ])
        let model = ArchiveTest.model(repository)
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
}
