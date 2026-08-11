import AppCore
import AppCoreFakes
import Testing

@testable import FeatureTransactions

/// Whether a page landing tells ``AppShellModel`` — via ``ReachabilityWitness``
/// — that the backend was just reached. Only a *successful* fetch is
/// evidence of anything; a failure is not proof the backend is unreachable
/// bootstrap didn't already have, so it must stay silent.
@MainActor
@Suite("Transactions reachability signal")
internal struct TransactionsReachabilityTests {
    private func model(
        _ repository: any TransactionsRepository,
        reachability: FakeReachabilityWitness
    ) -> TransactionsListViewModel {
        TransactionsListViewModel(
            dependencies: .fake(transactions: repository, reachability: reachability),
            router: Router()
        )
    }

    @Test("a successful first page signals reachability")
    func firstPageSignalsReachability() async {
        let reachability = FakeReachabilityWitness()
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 2))

        await model(repository, reachability: reachability).loadFirstPage()

        #expect(await reachability.callCount == 1)
    }

    @Test("a failed first page signals nothing")
    func failedFirstPageDoesNotSignalReachability() async {
        let reachability = FakeReachabilityWitness()
        let repository = ScriptedTransactionsRepository(script: [
            .failing(RepositoryError.unavailable)
        ])

        await model(repository, reachability: reachability).loadFirstPage()

        #expect(await reachability.callCount == 0)
    }

    @Test("a successful refresh signals reachability")
    func successfulRefreshSignalsReachability() async {
        let reachability = FakeReachabilityWitness()
        let repository = ScriptedTransactionsRepository(script: [
            .page(Transaction.fakes(count: 1), next: nil)
        ])

        await model(repository, reachability: reachability).refresh()

        #expect(await reachability.callCount == 1)
    }

    @Test("a failed refresh signals nothing")
    func failedRefreshDoesNotSignalReachability() async {
        let reachability = FakeReachabilityWitness()
        let repository = ScriptedTransactionsRepository(script: [
            .failing(RepositoryError.unavailable)
        ])

        await model(repository, reachability: reachability).refresh()

        #expect(await reachability.callCount == 0)
    }

    @Test("a successful next page signals reachability again")
    func nextPageSignalsReachability() async {
        let reachability = FakeReachabilityWitness()
        let repository = ScriptedTransactionsRepository(script: [
            .page(Transaction.fakes(count: 1), next: "cursor-1"),
            .page(Transaction.fakes(count: 1), next: nil),
        ])
        let model = model(repository, reachability: reachability)
        await model.loadFirstPage()
        #expect(await reachability.callCount == 1)

        await model.loadNextPageIfNeeded()

        #expect(await reachability.callCount == 2)
    }
}
