import AppCore
import AppCoreFakes
import Testing

@testable import FeatureTransactions

/// Every way this screen can fail, and the one distinction the whole design
/// rests on: nothing to show is not the same as could not ask.
@MainActor
@Suite("Transactions failures")
internal struct TransactionsListFailureTests {
    private func model(_ repository: any TransactionsRepository) -> TransactionsListViewModel {
        TransactionsListViewModel(dependencies: .fake(transactions: repository), router: Router())
    }

    @Test("a first page with no rows in it is the empty state, not a failure")
    func emptyFirstPage() async {
        let model = model(InMemoryTransactionsRepository(rows: []))

        await model.loadFirstPage()

        #expect(model.state == .empty)
        #expect(model.paging == .exhausted)
    }

    /// The reason the BFM answers a finance outage with a typed response rather
    /// than an empty list: an empty list says "you have no transactions", which
    /// is a lie somebody could act on.
    @Test("finance being unavailable is a failure, never an empty list")
    func unavailableIsNotEmpty() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        await repository.fail(onCall: 1, with: .unavailable)
        let model = model(repository)

        await model.loadFirstPage()

        #expect(model.state == .failed(.unavailable))
    }

    @Test("retrying from the error state loads the list")
    func retryFromTheErrorState() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        await repository.fail(onCall: 1, with: .unavailable)
        let model = model(repository)
        await model.loadFirstPage()
        #expect(model.state == .failed(.unavailable))

        await model.loadFirstPage()

        #expect(model.state == .loaded(Transaction.fakes(count: 2)))
        #expect(await repository.callCount == 2)
    }

    /// An old build meeting a newer contract is a different problem from a
    /// pillar being down, and the two have different next moves — update the
    /// app versus wait a minute. They must not arrive as the same value.
    @Test("a contract mismatch is distinguishable from an outage")
    func contractMismatchIsItsOwnFailure() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))
        await repository.fail(onCall: 1, with: .contractMismatch)
        let model = model(repository)

        await model.loadFirstPage()

        #expect(model.state == .failed(.contractMismatch))
        #expect(model.state != .failed(.unavailable))
    }

    /// The half-list the ticket is about. Credentials going bad on page three
    /// must not leave a screen that looks like the whole of someone's spending.
    @Test("an auth failure mid-scroll keeps the rows and marks the list unfinished")
    func authFailureMidScroll() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))
        await repository.fail(onCall: 2, with: .unauthorized)
        let model = model(repository)

        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()

        #expect(model.state == .loaded(Transaction.fakes(count: 2)))
        #expect(model.paging == .failed(.unauthorized))
        #expect(model.paging != .exhausted)
    }

    /// The tail can be retried after that, because the middleware may have
    /// recovered the session by the time somebody taps.
    @Test("the tail recovers when a retry works")
    func retryAfterAnAuthFailure() async {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 4))
        await repository.fail(onCall: 2, with: .unauthorized)
        let model = model(repository)
        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()

        await model.retryNextPage()

        #expect(model.state == .loaded(Transaction.fakes(count: 4)))
        #expect(model.paging == .exhausted)
    }

    /// `TransactionsRepository` does not constrain what it throws, so a
    /// conforming implementation can throw anything at all. None of it may
    /// reach a screen as a crash or as a blank.
    @Test("an error this app has never heard of still produces a failure state")
    func unrecognisedErrorsBecomeTransport() async {
        let repository = ScriptedTransactionsRepository(script: [
            .failing(UnrecognisedRepositoryFailure())
        ])
        let model = model(repository)

        await model.loadFirstPage()

        guard case .failed(.transport) = model.state else {
            Issue.record("expected a transport failure, got \(model.state)")
            return
        }
    }

    /// A screen the reader has navigated away from is not a screen to leave an
    /// error on, ready for whoever comes back to it.
    @Test("a cancelled first load is not a failure")
    func cancellationIsNotAFailure() async {
        let repository = ScriptedTransactionsRepository(script: [.failing(CancellationError())])
        let model = model(repository)

        await model.loadFirstPage()

        #expect(model.state == .loading)
    }

    /// The cancellation that does *not* arrive as a `CancellationError`.
    ///
    /// A repository over URLSession reports a cancelled request as its own
    /// error type — `URLError(.cancelled)`, wrapped in whatever the layers
    /// beneath wrap things in — and none of those types are nameable from this
    /// module. What is answerable here is whether the work is still wanted, so
    /// the screen asks the task rather than the error.
    @Test("a failure that arrives after the task was cancelled is not a failure either")
    func cancellationWithoutACancellationError() async {
        let repository = ScriptedTransactionsRepository(
            script: [.failing(RepositoryError.unavailable)],
            gating: [1]
        )
        let model = model(repository)

        let load = Task { await model.loadFirstPage() }
        await repository.waitUntilCalled(1)
        load.cancel()
        await repository.release()
        await load.value

        #expect(model.state == .loading)
    }

    /// The same, one page in — where the cost of getting it wrong is not a
    /// stale error but a footer that spins forever and a list that never pages
    /// again.
    @Test("a cancelled page fetch leaves the tail able to try again")
    func cancellationMidScrollSettlesPaging() async {
        let repository = ScriptedTransactionsRepository(script: [
            .page(Transaction.fakes(count: 2), next: "cursor-1"),
            .failing(CancellationError()),
            .page([Transaction.fake(id: "txn-9")], next: nil),
        ])
        let model = model(repository)
        await model.loadFirstPage()

        await model.loadNextPageIfNeeded()
        #expect(model.paging == .idle)

        await model.loadNextPageIfNeeded()

        #expect(model.paging == .exhausted)
        #expect(await repository.callCount == 3)
    }

    /// The composition root failing to bind a repository is a build defect, and
    /// it surfaces as this screen's error state rather than as a crash on
    /// somebody's phone.
    @Test("an unbound repository fails the screen rather than trapping")
    func unboundDependency() async {
        let model = TransactionsListViewModel(dependencies: .unbound, router: Router())

        await model.loadFirstPage()

        #expect(model.state == .failed(.dependencyNotBound))
    }
}
