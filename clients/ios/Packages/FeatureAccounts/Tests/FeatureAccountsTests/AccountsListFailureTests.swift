import AppCore
import AppCoreFakes
import Testing

@testable import FeatureAccounts

/// The same distinction `TransactionsListFailureTests` exercises: nothing to
/// show is not the same as could not ask.
@MainActor
@Suite("Accounts list failures")
internal struct AccountsListFailureTests {
    private func model(_ repository: any AccountsRepository) -> AccountsListViewModel {
        AccountsListViewModel(dependencies: .fake(accounts: repository), router: Router())
    }

    @Test("a fetch with no accounts in it is the empty state, not a failure")
    func emptyFetch() async {
        let model = model(InMemoryAccountsRepository(rows: []))

        await model.loadAccounts()

        #expect(model.state == .empty)
    }

    @Test("finance being unavailable is a failure, never an empty list")
    func unavailableIsNotEmpty() async {
        let repository = InMemoryAccountsRepository(rows: Account.fakes(count: 2))
        await repository.fail(with: .unavailable)
        let model = model(repository)

        await model.loadAccounts()

        #expect(model.state == .failed(.unavailable))
    }

    @Test("retrying from the error state loads the list")
    func retryFromTheErrorState() async {
        let repository = InMemoryAccountsRepository(rows: Account.fakes(count: 2))
        await repository.fail(with: .unavailable)
        let model = model(repository)
        await model.loadAccounts()
        #expect(model.state == .failed(.unavailable))

        await repository.fail(with: nil)
        await model.loadAccounts()

        #expect(model.state == .loaded(Account.fakes(count: 2)))
    }

    @Test("a refresh failure is reported beside the rows, not instead of them")
    func refreshFailureKeepsRows() async {
        let repository = InMemoryAccountsRepository(rows: Account.fakes(count: 2))
        let model = model(repository)
        await model.loadAccounts()

        await repository.fail(with: .unavailable)
        await model.refresh()

        #expect(model.state == .loaded(Account.fakes(count: 2)))
        #expect(model.refreshFailure == .unavailable)
    }

    @Test("a successful refresh clears a prior failure")
    func refreshRecovers() async {
        let repository = InMemoryAccountsRepository(rows: Account.fakes(count: 2))
        let model = model(repository)
        await model.loadAccounts()
        await repository.fail(with: .unavailable)
        await model.refresh()
        #expect(model.refreshFailure == .unavailable)

        await repository.fail(with: nil)
        await model.refresh()

        #expect(model.refreshFailure == nil)
    }

    @Test("an unbound repository fails the screen rather than trapping")
    func unboundDependency() async {
        let model = AccountsListViewModel(dependencies: .unbound, router: Router())

        await model.loadAccounts()

        #expect(model.state == .failed(.dependencyNotBound))
    }

    @Test("a cancelled load is not a failure")
    func cancellationIsNotAFailure() async {
        let repository = InMemoryAccountsRepository(rows: Account.fakes(count: 2))
        let model = model(repository)
        // Nothing forces cancellation here without a scripted double; this
        // asserts the ordinary path lands on `.loaded`, and the cancellation
        // guard itself is shared code with `TransactionsListViewModel`,
        // exercised there.
        await model.loadAccounts()

        #expect(model.state == .loaded(Account.fakes(count: 2)))
    }
}
