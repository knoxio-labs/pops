import AppCore
import AppCoreFakes
import Testing

@testable import FeatureAccounts

@MainActor
@Suite("Account entity")
internal struct AccountEntityTests {
    @Test("parses a finance account URI")
    func parsesAccountURI() {
        let entity = AccountEntity(PopsURI(pillar: "finance", type: "account", id: "a1"))

        #expect(entity?.accountId == "a1")
        #expect(entity?.id == "a1")
    }

    @Test("rejects URIs for other domains and types")
    func rejectsOtherURIs() {
        #expect(AccountEntity(PopsURI(pillar: "finance", type: "transaction", id: "t1")) == nil)
        #expect(AccountEntity(PopsURI(pillar: "inventory", type: "account", id: "a1")) == nil)
    }

    @Test("every declared account type parses")
    func everyDeclaredTypeParses() {
        #expect(
            AccountEntity.types.allSatisfy {
                AccountEntity(PopsURI(pillar: AccountEntity.pillar, type: $0, id: "a1")) != nil
            }
        )
    }

    @Test("the detail model loads the id from its entity")
    func detailModelLoadsEntityID() async {
        guard let entity = AccountEntity(PopsURI(pillar: "finance", type: "account", id: "a1"))
        else {
            Issue.record("the account URI should produce an entity")
            return
        }

        let expected = AccountDetail.fake(account: .fake(id: "a1"))
        let other = AccountDetail.fake(account: .fake(id: "a2"))
        let repository = InMemoryAccountsRepository(details: [expected, other])
        let model = AccountDetailViewModel(
            id: entity.accountId,
            seed: nil,
            dependencies: .fake(accounts: repository)
        )

        await model.load()

        #expect(model.state == .loaded(expected))
        #expect(await repository.detailCallCount == 1)
    }
}
