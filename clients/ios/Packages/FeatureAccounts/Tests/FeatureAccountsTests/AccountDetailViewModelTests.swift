import AppCore
import AppCoreFakes
import Testing

@testable import FeatureAccounts

@MainActor
@Suite("Account detail view model")
internal struct AccountDetailViewModelTests {
    @Test("opens on the seed while the fuller record is fetched")
    func opensOnSeed() {
        let seed = Account.fake(id: "acc-1", name: "Seeded")
        let model = AccountDetailViewModel(id: "acc-1", seed: seed, dependencies: .fake())

        #expect(model.state == .seeded(seed))
    }

    @Test("no seed at all is the loading state")
    func noSeedIsLoading() {
        let model = AccountDetailViewModel(id: "acc-1", seed: nil, dependencies: .fake())

        #expect(model.state == .loading)
    }

    @Test("a fetch that answers replaces the seed with the fuller record")
    func fetchReplacesSeed() async {
        let detail = AccountDetail.fake(account: .fake(id: "acc-1"))
        let repository = InMemoryAccountsRepository(details: [detail])
        let model = AccountDetailViewModel(
            id: "acc-1", seed: Account.fake(id: "acc-1"), dependencies: .fake(accounts: repository))

        await model.load()

        #expect(model.state == .loaded(detail))
    }

    @Test("an account finance no longer has is not found, not a failure")
    func accountGoneIsNotFound() async {
        let repository = InMemoryAccountsRepository(details: [])
        let model = AccountDetailViewModel(
            id: "acc-1", seed: nil, dependencies: .fake(accounts: repository))

        await model.load()

        #expect(model.state == .notFound)
    }

    @Test("a failure with nothing on screen is the screen's own failure state")
    func failureWithNoSeed() async {
        let repository = InMemoryAccountsRepository()
        await repository.failDetail(for: "acc-1", with: .unavailable)
        let model = AccountDetailViewModel(
            id: "acc-1", seed: nil, dependencies: .fake(accounts: repository))

        await model.load()

        #expect(model.state == .failed(.unavailable))
    }

    @Test("a failure over a seeded row keeps the row and reports the failure beside it")
    func failureOverSeedKeepsContent() async {
        let repository = InMemoryAccountsRepository()
        await repository.failDetail(for: "acc-1", with: .unavailable)
        let seed = Account.fake(id: "acc-1")
        let model = AccountDetailViewModel(
            id: "acc-1", seed: seed, dependencies: .fake(accounts: repository))

        await model.load()

        #expect(model.state == .seeded(seed))
        #expect(model.failure == .unavailable)
    }

    @Test("loading again after an answer already landed does nothing further")
    func doesNotRefetchAfterLoading() async {
        let detail = AccountDetail.fake(account: .fake(id: "acc-1"))
        let repository = InMemoryAccountsRepository(details: [detail])
        let model = AccountDetailViewModel(
            id: "acc-1", seed: nil, dependencies: .fake(accounts: repository))
        await model.load()

        await model.load()

        #expect(await repository.detailCallCount == 1)
    }
}
