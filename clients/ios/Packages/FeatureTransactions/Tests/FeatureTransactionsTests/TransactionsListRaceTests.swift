import AppCore
import AppCoreFakes
import Testing

@testable import FeatureTransactions

/// What happens when two requests are in the air at once.
///
/// Split from `TransactionsListRefreshTests` because the questions are
/// different: that suite asks what a refresh does, this one asks what a refresh
/// does to a request that was already out. Every test here uses the gated
/// repository, so the overlap is a handshake rather than a sleep and the result
/// is the same on a loaded CI runner as on a quiet laptop.
@MainActor
@Suite("Transactions request races")
internal struct TransactionsListRaceTests {
    private func model(_ repository: any TransactionsRepository) -> TransactionsListViewModel {
        TransactionsListViewModel(dependencies: .fake(transactions: repository), router: Router())
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

    /// The superseded fetch does not have to come back before the refreshed
    /// list can page.
    ///
    /// This is the case where the stale request is stuck — which is usually
    /// *why* somebody pulled to refresh. If anything but ``PagingState`` gated a
    /// next page, that flag would still be held by the abandoned fetch and the
    /// fresh list would refuse to page until it finally answered, with a footer
    /// that had already spent its one appearance.
    @Test("a refreshed list pages again without waiting for the fetch it superseded")
    func pagingResumesWhileTheSupersededFetchIsStillOut() async {
        let repository = ScriptedTransactionsRepository(
            script: [
                .page(Transaction.fakes(count: 2), next: "cursor-1"),
                .page([Transaction.fake(id: "stale-1")], next: "cursor-2"),
                .page([Transaction.fake(id: "fresh-1")], next: "fresh-cursor"),
                .page([Transaction.fake(id: "fresh-2")], next: nil),
            ],
            gating: [2]
        )
        let model = model(repository)
        await model.loadFirstPage()

        let abandoned = Task { await model.loadNextPageIfNeeded() }
        await repository.waitUntilCalled(2)
        await model.refresh()
        #expect(model.paging == .idle)

        // Still parked. The refreshed list must page anyway.
        await model.loadNextPageIfNeeded()

        #expect(await repository.callCount == 4, "the abandoned fetch blocked the refreshed list")
        #expect(await repository.requestedCursors.last == "fresh-cursor")
        #expect(model.paging == .exhausted)

        await repository.release()
        await abandoned.value

        #expect(
            model.state
                == .loaded([Transaction.fake(id: "fresh-1"), Transaction.fake(id: "fresh-2")]))
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

    /// A refresh the reader abandoned must not quietly hand a failed tail back
    /// to the scroll position — the cancellation route into
    /// `settlePagingIfLoading`, whose failure route is covered next door.
    @Test("a cancelled refresh does not re-arm a failed tail")
    func aCancelledRefreshLeavesTheFailedTailAlone() async {
        let repository = ScriptedTransactionsRepository(
            script: [
                .page(Transaction.fakes(count: 2), next: "cursor-1"),
                .failing(RepositoryError.unavailable),
                .failing(RepositoryError.transport("abandoned")),
            ],
            gating: [3]
        )
        let model = model(repository)
        await model.loadFirstPage()
        await model.loadNextPageIfNeeded()
        #expect(model.paging == .failed(.unavailable))

        let abandoned = Task { await model.refresh() }
        await repository.waitUntilCalled(3)
        abandoned.cancel()
        await repository.release()
        await abandoned.value

        #expect(model.paging == .failed(.unavailable))
        #expect(model.refreshFailure == nil)
    }
}
