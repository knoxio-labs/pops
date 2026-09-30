import AppCore
import AppCoreFakes
import Testing

@testable import FeatureTransactions

/// Paging, against fakes and with no network anywhere.
///
/// The assertions that matter most here are the call counts. A list that
/// fetches the same page twice looks identical to one that fetches it once —
/// the rows are right either way — and the cost lands on somebody's cellular
/// plan rather than on a screen anyone would notice.
@MainActor
@Suite("Transactions paging")
internal struct TransactionsListPagingTests {
    private func model(_ repository: any TransactionsRepository) -> TransactionsListViewModel {
        TransactionsListViewModel(dependencies: .fake(transactions: repository), router: Router())
    }

    @Test("the first page loads and becomes the rows on screen")
    func firstPageLoads() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        let model = model(repository)

        await model.loadFirstPage()

        #expect(model.state == .loaded(Transaction.fakes(count: 2)))
        #expect(model.paging == .exhausted)
        #expect(await repository.callCount == 1)
    }

    @Test("duplicate ids within the first page are shown once")
    func firstPageRowsAreUnique() async {
        let duplicate = Transaction.fake(id: "txn-1", description: "First")
        let repository = ScriptedTransactionsRepository(script: [
            .page([duplicate, Transaction.fake(id: "txn-2"), duplicate], next: nil),
        ])
        let model = model(repository)

        await model.loadFirstPage()

        #expect(model.state == .loaded([duplicate, Transaction.fake(id: "txn-2")]))
    }

    /// The `.task` that loads the screen runs again on every reappearance. It
    /// must not re-fetch what is already there.
    @Test("a second load of the first page is not a second request")
    func firstPageIsNotRefetched() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        let model = model(repository)

        await model.loadFirstPage()
        await model.loadFirstPage()

        #expect(await repository.callCount == 1)
    }

    @Test("reaching the end fetches the next page exactly once, however often it is asked")
    func nextPageIsFetchedOnce() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))
        let model = model(repository)
        await model.loadFirstPage()
        #expect(model.paging == .idle)

        // The shape a scrolling list actually produces: the footer appears,
        // SwiftUI lays out again, and the trigger fires more than once before
        // the first response has landed.
        async let first: Void = model.loadNextPageIfNeeded()
        async let second: Void = model.loadNextPageIfNeeded()
        async let third: Void = model.loadNextPageIfNeeded()
        _ = await (first, second, third)

        #expect(await repository.callCount == 2)
        #expect(model.state == .loaded(Transaction.fakes(count: 4)))
    }

    @Test("the last page terminates and nothing asks again")
    func lastPageTerminates() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 3))
        let model = model(repository)

        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()
        #expect(model.paging == .exhausted)

        await model.loadNextPageIfNeeded()
        await model.loadNextPageIfNeeded()

        #expect(await repository.callCount == 2)
        #expect(model.state == .loaded(Transaction.fakes(count: 3)))
    }

    @Test("a retry asks for the cursor that failed, not for the first page again")
    func retryResumesFromTheSameCursor() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page(Transaction.fakes(count: 2), next: "cursor-1"),
            .failing(RepositoryError.unavailable),
            .page([Transaction.fake(id: "txn-9")], next: nil),
        ])
        let model = model(repository)

        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()
        #expect(model.paging == .failed(.unavailable))

        await model.retryNextPage()

        #expect(await repository.requestedCursors == [nil, "cursor-1", "cursor-1"])
        #expect(model.paging == .exhausted)
    }

    /// The footer can remain visible after failure. Keeping it retryable but
    /// inert means a refused request does not become a loop.
    @Test("reaching the end again does not retry a failed page")
    func aFailedPageIsNotRetriedByScrolling() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page(Transaction.fakes(count: 2), next: "cursor-1"),
            .failing(RepositoryError.unavailable),
        ])
        let model = model(repository)

        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()

        await model.loadNextPageIfNeeded()
        await model.loadNextPageIfNeeded()

        #expect(await repository.callCount == 2)
        #expect(model.paging == .failed(.unavailable))
    }

    /// A well-behaved cursor never re-sends a row. Keep the first copy when a
    /// page overlaps so SwiftUI sees one stable identity per transaction.
    @Test("a row that arrives on two pages is shown once")
    func duplicateRowsAreNotAppendedTwice() async {
        let overlapping = Transaction.fake(id: "txn-1", description: "Twice")
        let repository = ScriptedTransactionsRepository(script: [
            .page([overlapping, Transaction.fake(id: "txn-2")], next: "cursor-1"),
            .page([overlapping, Transaction.fake(id: "txn-3")], next: nil),
        ])
        let model = model(repository)

        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()

        guard case .loaded(let rows) = model.state else {
            Issue.record("expected rows, got \(model.state)")
            return
        }
        #expect(rows.map(\.id) == ["txn-1", "txn-2", "txn-3"])
    }

    /// Odd, but the contract allows it: a page with no rows and a cursor still
    /// pointing forward. The screen says "nothing yet" and keeps paging rather
    /// than stopping on the first thin answer.
    @Test("an empty page that still carries a cursor keeps paging")
    func emptyPageWithACursorKeepsPaging() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page([], next: "cursor-1"),
            .page([Transaction.fake(id: "txn-1")], next: nil),
        ])
        let model = model(repository)

        await model.loadFirstPage()
        #expect(model.state == .empty)
        #expect(model.paging == .idle)

        await model.loadNextPageIfNeeded()

        #expect(model.state == .loaded([Transaction.fake(id: "txn-1")]))
        #expect(model.paging == .exhausted)
    }

    @Test("each short page advances the scroll boundary trigger")
    func shortPagesAdvanceBoundaryTrigger() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page([Transaction.fake(id: "txn-1")], next: "cursor-1"),
            .page([Transaction.fake(id: "txn-2")], next: "cursor-2"),
            .page([Transaction.fake(id: "txn-3")], next: nil),
        ])
        let model = model(repository)

        await model.loadFirstPage()
        #expect(model.pageRevision == 1)
        await model.loadNextPageIfNeeded()
        #expect(model.pageRevision == 2)
        await model.loadNextPageIfNeeded()
        #expect(model.pageRevision == 3)
        #expect(model.paging == .exhausted)
    }

    @Test("a repeated cursor stops automatic paging and preserves loaded rows")
    func repeatedCursorStopsPaging() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page([Transaction.fake(id: "txn-1")], next: "cursor-1"),
            .page([Transaction.fake(id: "txn-2")], next: "cursor-1"),
        ])
        let model = model(repository)

        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()
        await model.loadNextPageIfNeeded()

        #expect(model.state == .loaded([
            Transaction.fake(id: "txn-1"),
            Transaction.fake(id: "txn-2"),
        ]))
        #expect(model.paging == .failed(.contractMismatch))
        #expect(await repository.callCount == 2)
    }

    @Test("nothing pages before a first page has landed")
    func noPagingBeforeTheFirstPage() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))
        let model = model(repository)

        await model.loadNextPageIfNeeded()
        await model.retryNextPage()

        #expect(await repository.callCount == 0)
        #expect(model.state == .loading)
    }
}
