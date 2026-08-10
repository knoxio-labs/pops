import AppCore
import AppCoreFakes
import Testing

@testable import FeatureTransactions

/// Pull-to-refresh: what it resets, what it keeps, and what it does to a
/// request that was already in the air when the gesture happened.
@MainActor
@Suite("Transactions refresh")
internal struct TransactionsListRefreshTests {
    private func model(_ repository: any TransactionsRepository) -> TransactionsListViewModel {
        TransactionsListViewModel(dependencies: .fake(transactions: repository))
    }

    @Test("a refresh replaces the rows rather than appending to them")
    func refreshReplaces() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))
        let model = model(repository)
        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()
        #expect(model.state == .loaded(Transaction.fakes(count: 4)))

        await repository.replace(with: [Transaction.fake(id: "fresh-1")])
        await model.refresh()

        #expect(model.state == .loaded([Transaction.fake(id: "fresh-1")]))
        #expect(model.paging == .exhausted)
    }

    /// The cursor is the server's and is only valid against the list it was
    /// minted from. A refresh that carried the old one forward would be asking
    /// a new list for a position in an old one — which the fake, like the BFM,
    /// answers as a contract mismatch rather than as rows.
    @Test("a refresh asks for the first page, not for where the list had got to")
    func refreshResetsTheCursor() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page(Transaction.fakes(count: 2), next: "cursor-1"),
            .page([Transaction.fake(id: "fresh-1")], next: nil),
        ])
        let model = model(repository)
        await model.loadFirstPage()

        await model.refresh()

        #expect(await repository.requestedCursors == [nil, nil])
    }

    /// The failure this is really about: a page request already in flight when
    /// the gesture lands. Its answer is for a list that no longer exists, and
    /// appending it would put rows from before the refresh underneath rows from
    /// after it.
    @Test("a page fetch that lands after a refresh does not merge itself back in")
    func aSupersededPageIsDiscarded() async {
        let stale = Transaction.fake(id: "stale-1", description: "From before the refresh")
        let repository = ScriptedTransactionsRepository(
            script: [
                .page(Transaction.fakes(count: 2), next: "cursor-1"),
                .page([stale], next: "cursor-2"),
                .page([Transaction.fake(id: "fresh-1")], next: nil),
            ],
            gating: [2]
        )
        let model = model(repository)
        await model.loadFirstPage()

        let paging = Task { await model.loadNextPageIfNeeded() }
        await repository.waitUntilCalled(2)
        await model.refresh()
        await repository.release()
        await paging.value

        #expect(model.state == .loaded([Transaction.fake(id: "fresh-1")]))
        #expect(model.paging == .exhausted)
    }

    /// The same race, with the refresh failing. The superseded fetch is not
    /// coming back to clear the `.loading` it set, so the refresh has to — or
    /// the footer spins for the rest of the session and no later page is ever
    /// requested.
    @Test("a failed refresh does not strand the footer on loading")
    func aFailedRefreshSettlesPaging() async {
        let repository = ScriptedTransactionsRepository(
            script: [
                .page(Transaction.fakes(count: 2), next: "cursor-1"),
                .page([Transaction.fake(id: "stale-1")], next: "cursor-2"),
                .failing(RepositoryError.unavailable),
            ],
            gating: [2]
        )
        let model = model(repository)
        await model.loadFirstPage()

        let paging = Task { await model.loadNextPageIfNeeded() }
        await repository.waitUntilCalled(2)
        await model.refresh()
        await repository.release()
        await paging.value

        #expect(model.refreshFailure == .unavailable)
        #expect(model.paging == .idle)
    }

    /// A refresh is an offer to re-check, not a demand. Answering a failed one
    /// by deleting what somebody was reading costs them the screen and tells
    /// them nothing they could not have been told beside it.
    @Test("a failed refresh keeps the rows and says why")
    func aFailedRefreshKeepsTheRows() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        let model = model(repository)
        await model.loadFirstPage()

        await repository.fail(onCall: 2, with: .unavailable)
        await model.refresh()

        #expect(model.state == .loaded(Transaction.fakes(count: 2)))
        #expect(model.refreshFailure == .unavailable)
    }

    @Test("a refresh that works clears the failure the last one left")
    func aSuccessfulRefreshClearsTheFailure() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        let model = model(repository)
        await model.loadFirstPage()
        await repository.fail(onCall: 2, with: .unavailable)
        await model.refresh()
        #expect(model.refreshFailure == .unavailable)

        await model.refresh()

        #expect(model.refreshFailure == nil)
        #expect(model.state == .loaded(Transaction.fakes(count: 2)))
    }

    /// The banner is announced to VoiceOver from an `onChange`, so a failure
    /// that is written on top of an identical one changes nothing and is
    /// therefore said nothing about — a retry that produces silence for anyone
    /// who cannot see the banner. Clearing before the request is what makes
    /// every failure a `nil -> error` transition, and this is the observable
    /// form of that: mid-flight, there is no failure outstanding.
    @Test("a refresh clears the previous failure before it asks again")
    func refreshClearsTheFailureBeforeRetrying() async {
        let repository = ScriptedTransactionsRepository(
            script: [
                .page(Transaction.fakes(count: 2), next: nil),
                .failing(RepositoryError.unavailable),
                .failing(RepositoryError.unavailable),
            ],
            gating: [3]
        )
        let model = model(repository)
        await model.loadFirstPage()
        await model.refresh()
        #expect(model.refreshFailure == .unavailable)

        let retry = Task { await model.refresh() }
        await repository.waitUntilCalled(3)

        #expect(model.refreshFailure == nil, "a retry left the previous failure standing")

        await repository.release()
        await retry.value

        #expect(model.refreshFailure == .unavailable)
    }

    /// Two pulls before the first answers is one gesture repeated, not two
    /// lists to fetch.
    @Test("a second refresh while one is in flight is dropped")
    func refreshIsNotReentrant() async {
        let repository = ScriptedTransactionsRepository(
            script: [
                .page(Transaction.fakes(count: 2), next: nil),
                .page([Transaction.fake(id: "fresh-1")], next: nil),
            ],
            gating: [2]
        )
        let model = model(repository)
        await model.loadFirstPage()

        let first = Task { await model.refresh() }
        await repository.waitUntilCalled(2)
        await model.refresh()
        await repository.release()
        await first.value

        #expect(await repository.callCount == 2)
        #expect(model.state == .loaded([Transaction.fake(id: "fresh-1")]))
    }

    /// The empty state is reachable by refreshing into it, not only on a first
    /// load — and it must still read as "nothing here", never as a failure.
    @Test("a refresh that comes back empty renders the empty state")
    func refreshingIntoEmptiness() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        let model = model(repository)
        await model.loadFirstPage()

        await repository.replace(with: [])
        await model.refresh()

        #expect(model.state == .empty)
        #expect(model.refreshFailure == nil)
    }
}
