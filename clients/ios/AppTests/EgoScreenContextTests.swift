import AppCore
import FeatureAccounts
import FeatureInventory
import FeaturePurchases
import FeatureTransactions
import Testing

@testable import Pops

@Suite("Ego screen context")
@MainActor
internal struct EgoScreenContextTests {
    @Test("the selected Purchases tab names its owning app")
    func selectedPurchasesTab() {
        let context = provider()
        context.selectedTab = FeaturePurchases.feature

        let expected = EgoAppContext(
            app: "purchases", uri: nil, route: nil, entityTitle: nil)
        #expect(context.current == expected)
    }

    @Test("a More selection contributes its feature router's visible route")
    func moreSelectionUsesRouterPath() {
        let context = provider(path: [.accountDetail(id: "account-1")])
        context.selectedTab = ContentView.moreTab
        context.moreSelection = FeatureAccounts.feature

        let expected = EgoAppContext(
            app: "finance", uri: "pops:finance/account/account-1", route: nil,
            entityTitle: nil)
        #expect(context.current == expected)
    }

    @Test("More without a selected feature has no app context")
    func emptyMoreSelection() {
        let context = provider()
        context.selectedTab = ContentView.moreTab

        #expect(context.current == nil)
    }

    @Test("a presented record overrides the route and clearing it restores the route")
    func presentedObjectOverridesRoute() {
        let context = provider(path: [.accountDetail(id: "account-1")])
        context.selectedTab = FeatureAccounts.feature
        context.presentedObjectURI = "pops:inventory/item/item-1"

        let presented = EgoAppContext(
            app: "finance", uri: "pops:inventory/item/item-1", route: nil, entityTitle: nil)
        #expect(context.current == presented)

        context.presentedObjectURI = nil
        let routed = EgoAppContext(
            app: "finance", uri: "pops:finance/account/account-1", route: nil,
            entityTitle: nil)
        #expect(context.current == routed)
    }

    @Test("search has no app context without a presented object")
    func searchTabHasNoContext() {
        let context = provider()
        context.selectedTab = ContentView.searchTab

        #expect(context.current == nil)
    }

    @Test("entity presentations expose their canonical object URIs and clear")
    func entityPresentationURI() {
        let presentation = EntityPresentation()

        presentation.inventory = .item("item-1")
        #expect(presentation.presentedObjectURI == "pops:inventory/item/item-1")
        presentation.inventory = .location("location-1")
        #expect(presentation.presentedObjectURI == "pops:inventory/location/location-1")
        presentation.inventory = nil

        presentation.transaction = TransactionEntity(
            PopsURI(pillar: "finance", type: "transaction", id: "transaction-1"))
        #expect(presentation.presentedObjectURI == "pops:finance/transaction/transaction-1")
        presentation.transaction = nil

        presentation.account = AccountEntity(
            PopsURI(pillar: "finance", type: "account", id: "account-1"))
        #expect(presentation.presentedObjectURI == "pops:finance/account/account-1")
        presentation.account = nil

        presentation.purchase = PurchaseEntity(
            PopsURI(pillar: "purchases", type: "purchase", id: "purchase-1"))
        #expect(presentation.presentedObjectURI == "pops:purchases/purchase/purchase-1")
        presentation.purchase = nil
        #expect(presentation.presentedObjectURI == nil)
    }

    private func provider(path: [Route] = []) -> EgoScreenContextProvider {
        EgoScreenContextProvider { _ in path }
    }
}
