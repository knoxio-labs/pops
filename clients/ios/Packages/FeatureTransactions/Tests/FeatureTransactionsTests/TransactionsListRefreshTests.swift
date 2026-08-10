import AppCore
import AppCoreFakes
import Testing

@testable import FeatureTransactions

/// Pull-to-refresh: what it resets, what it keeps, and what it reports.
///
/// What it does to a request that was already in the air is next door in
/// `TransactionsListRaceTests` — a different question, and one that needs the
/// gated repository for every case rather than only some.
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

    /// A failed tail is waiting for a tap, and some *other* request failing is
    /// not that tap.
    ///
    /// Putting the footer back to `idle` would re-arm the appearance trigger
    /// with the row that provoked the failure still on screen — the automatic
    /// retry `retryNextPage()` exists to prevent, arrived at sideways. And the
    /// gesture that would trigger it is pull-to-refresh, which is exactly what
    /// somebody does repeatedly when a screen keeps failing.
    @Test("a failed refresh does not re-arm a failed tail")
    func aFailedRefreshLeavesTheFailedTailAlone() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page(Transaction.fakes(count: 2), next: "cursor-1"),
            .failing(RepositoryError.unavailable),
            .failing(RepositoryError.unavailable),
        ])
        let model = model(repository)
        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()
        #expect(model.paging == .failed(.unavailable))

        await model.refresh()

        #expect(model.paging == .failed(.unavailable), "a failed refresh re-armed the tail")
        #expect(model.refreshFailure == .unavailable)

        // The half that costs money: the footer must still be inert.
        await model.loadNextPageIfNeeded()
        #expect(await repository.callCount == 3)
    }

    /// The other side of the rule, and the reason it is not simply "never touch
    /// a failed tail": a refresh that *worked* replaced the list, so whatever
    /// the old tail was waiting for no longer exists.
    @Test("a refresh that works clears a failed tail")
    func aSuccessfulRefreshClearsTheFailedTail() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page(Transaction.fakes(count: 2), next: "cursor-1"),
            .failing(RepositoryError.unavailable),
            .page([Transaction.fake(id: "fresh-1")], next: nil),
        ])
        let model = model(repository)
        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()
        #expect(model.paging == .failed(.unavailable))

        await model.refresh()

        #expect(model.paging == .exhausted)
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
