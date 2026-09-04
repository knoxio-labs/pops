import AppCore
import AppCoreFakes
import Testing

@testable import FeatureAccounts

@MainActor
@Suite("Accounts navigation")
internal struct AccountsNavigationTests {
    @Test("selecting an account pushes its detail route")
    func selectPushesDetail() {
        let router = Router()
        let model = AccountsListViewModel(dependencies: .fake(), router: router)

        model.select(Account.fake(id: "acc-1"))

        #expect(router.path == [.accountDetail(id: "acc-1")])
    }

    @Test("the list hands back a row it is already holding")
    func seedFromLoadedRows() async {
        let repository = InMemoryAccountsRepository(rows: [Account.fake(id: "acc-1")])
        let model = AccountsListViewModel(
            dependencies: .fake(accounts: repository), router: Router())
        await model.loadAccounts()

        #expect(model.account(id: "acc-1")?.id == "acc-1")
    }

    @Test("a row nothing has loaded yet is an honest nil, not a crash")
    func noSeedBeforeLoading() {
        let model = AccountsListViewModel(dependencies: .fake(), router: Router())

        #expect(model.account(id: "acc-1") == nil)
    }
}
