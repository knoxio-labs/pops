import AppCore
import AppCoreFakes
import SwiftUI
import Testing

@Suite("Dependency container")
internal struct AppDependenciesTests {
    @Test("an unbound repository fails rather than trapping")
    func unboundTransactionsFail() async {
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await AppDependencies.unbound.transactions.transactions(after: nil)
        }
    }

    @Test("an unbound pairing service fails rather than trapping")
    func unboundPairingFails() async {
        await #expect(throws: PairingError.dependencyNotBound) {
            try await AppDependencies.unbound.pairing.pair(.fake())
        }
    }

    @Test("the environment holds the unbound container until something binds one")
    @MainActor
    func environmentDefaultIsUnbound() async {
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await EnvironmentValues().appDependencies.transactions.transactions(after: nil)
        }
    }

    @Test("a bound container hands back what it was given")
    func boundContainerResolves() async throws {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 1))
        let dependencies = AppDependencies.fake(transactions: repository)

        let page = try await dependencies.transactions.transactions(after: nil)

        #expect(page.transactions.count == 1)
    }

    @Test("an unbound accounts repository fails rather than trapping")
    func unboundAccountsFail() async {
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await AppDependencies.unbound.accounts.accounts()
        }
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await AppDependencies.unbound.accounts.accountDetail(id: "acc-1")
        }
    }

    @Test("an unbound merchant directory fails rather than returning an empty catalogue")
    func unboundMerchantDirectoryFails() async {
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await AppDependencies.unbound.merchants.search("shop")
        }
    }

    @Test("an unbound purchases update fails rather than pretending the purchase is missing")
    func unboundPurchaseUpdateFails() async {
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await AppDependencies.unbound.purchases.updatePurchase(
                id: "purchase-1",
                PurchaseUpdate(lines: [], expectedUpdatedAt: "opaque-token"))
        }
    }

    @Test("a bound accounts container hands back what it was given")
    func boundAccountsContainerResolves() async throws {
        let repository = InMemoryAccountsRepository(rows: Account.fakes(count: 2))
        let dependencies = AppDependencies.fake(accounts: repository)

        let accounts = try await dependencies.accounts.accounts()

        #expect(accounts.count == 2)
    }

    @Test("an unbound inventory store fails rather than trapping")
    func unboundInventoryFails() async {
        await #expect(throws: RepositoryError.dependencyNotBound) {
            _ = try await AppDependencies.unbound.inventory.perform(
                .createItem(
                    InventoryNewItem(id: "item-1", name: "Drill", typeKey: nil, placement: .hand)))
        }
    }

    @Test("an unbound inventory store's observe stream finishes rather than hanging")
    func unboundInventoryObserveFinishes() async {
        var iterator = AppDependencies.unbound.inventory.observe(.item(id: "item-1"))
            .makeAsyncIterator()

        let value = await iterator.next()

        #expect(value == nil)
    }

    @Test("a bound inventory container hands back what it was given")
    func boundInventoryContainerResolves() async throws {
        let store = InMemoryInventoryStore(
            items: [
                InventoryItem(
                    id: "item-1", revision: 1, seq: 1, name: "Drill", typeKey: nil,
                    placement: .hand, createdAt: .now, updatedAt: .now)
            ])
        let dependencies = AppDependencies.fake(inventory: store)

        var iterator = dependencies.inventory.observe(.item(id: "item-1")).makeAsyncIterator()
        let value = try #require(await iterator.next())

        #expect(value?.name == "Drill")
    }

    @Test("an unbound code suggester answers unavailable, the same as a server that cannot suggest")
    func unboundCodeSuggestionsAreUnavailable() async {
        await #expect(throws: InventorySyncTransportError.suggestionsUnavailable) {
            _ = try await AppDependencies.unbound.codeSuggestions.suggestCodes(
                name: "Drill", typeKey: nil, stem: nil)
        }
    }

    @Test("a bound code suggester hands back what it was given")
    func boundCodeSuggestionsResolve() async throws {
        let dependencies = AppDependencies.fake(
            codeSuggestions: FakeInventoryCodeSuggestionService { _, _, _ in ["B1"] })

        let suggestions = try await dependencies.codeSuggestions.suggestCodes(
            name: "Drill", typeKey: nil, stem: nil)

        #expect(suggestions == ["B1"])
    }

    @Test("an unbound barcode lookup is unavailable")
    func unboundBarcodeLookupIsUnavailable() async throws {
        let result = try await AppDependencies.unbound.barcodeLookup.lookUp(code: "9780140328721")

        #expect(result == .unavailable)
    }

    @Test("a fake container binds its barcode lookup")
    func fakeContainerBindsBarcodeLookup() async throws {
        let lookup = FakeInventoryBarcodeLookupService(result: .notFound)
        let dependencies = AppDependencies.fake(barcodeLookup: lookup)

        let result = try await dependencies.barcodeLookup.lookUp(code: "9780140328721")

        #expect(result == .notFound)
        #expect(await lookup.codes == ["9780140328721"])
    }
}
