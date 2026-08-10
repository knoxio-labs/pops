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

    /// The trigger is a row's appearance, and that row is still on screen after
    /// the failure. Left retryable, one refused request becomes a loop.
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

    /// A well-behaved cursor never re-sends a row. This is the belt: a repeated
    /// id renders as a repeated row rather than as an error, which is the class
    /// of defect that reaches production because nobody can tell it from a real
    /// second purchase at the same shop.
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
