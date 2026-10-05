import AppCore
import Auth
import FeatureAccounts
import FeatureInventory
import FeaturePurchases
import FeatureTransactions
import Testing

@testable import Pops

/// The app composition root registers the entity destinations the shell can present.
@Suite("entity routing")
@MainActor
internal struct EntityRoutingTests {
    private func composition() -> AppComposition {
        AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: Self.namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: Self.namespace)
            )
        )
    }

    @Test("a finance transaction reference is registered")
    func transactionRoutePresentsTheTransaction() {
        let root = composition()
        let uri = PopsURI(pillar: "finance", type: "transaction", id: "t1")

        #expect(root.entityRouter.route(uri) == .handled)
        #expect(root.entityPresentation.transaction?.transactionId == "t1")
    }

    @Test("a finance account reference is registered")
    func accountRoutePresentsTheAccount() {
        let root = composition()
        let uri = PopsURI(pillar: "finance", type: "account", id: "a1")

        #expect(root.entityRouter.route(uri) == .handled)
        #expect(root.entityPresentation.account?.accountId == "a1")
    }

    @Test("a purchase reference is registered")
    func purchaseRoutePresentsThePurchase() {
        let root = composition()
        let uri = PopsURI(pillar: "purchases", type: "purchase", id: "p1")

        #expect(root.entityRouter.route(uri) == .handled)
        #expect(root.entityPresentation.purchase?.purchaseId == "p1")
    }

    @Test("a movie reference remains unsupported")
    func movieRouteIsHandedOff() {
        let root = composition()
        let uri = PopsURI(pillar: "media", type: "movie", id: "1")

        #expect(root.entityRouter.route(uri) == .unsupported(pillar: "media"))
        #expect(root.entityPresentation.inventory == nil)
        #expect(root.entityPresentation.transaction == nil)
        #expect(root.entityPresentation.account == nil)
        #expect(root.entityPresentation.purchase == nil)
    }

    @Test("a purchase-item reference remains unsupported")
    func purchaseItemRouteIsHandedOff() {
        let root = composition()
        let uri = PopsURI(pillar: "purchases", type: "purchase-item", id: "line-1")

        #expect(root.entityRouter.route(uri) == .unsupported(pillar: "purchases"))
        #expect(root.entityPresentation.inventory == nil)
        #expect(root.entityPresentation.transaction == nil)
        #expect(root.entityPresentation.account == nil)
        #expect(root.entityPresentation.purchase == nil)
    }

    @Test("routing another transaction replaces the presented transaction")
    func laterTransactionReplacesEarlierTransaction() {
        let root = composition()

        #expect(
            root.entityRouter.route(
                PopsURI(pillar: "finance", type: "transaction", id: "first")) == .handled)
        #expect(
            root.entityRouter.route(
                PopsURI(pillar: "finance", type: "transaction", id: "second")) == .handled)

        #expect(root.entityPresentation.transaction?.transactionId == "second")
    }

    @Test("the Inventory item registration remains available")
    func inventoryItemRouteStillPresentsTheItem() {
        let root = composition()
        let uri = PopsURI(pillar: "inventory", type: "item", id: "item-1")

        #expect(root.entityRouter.route(uri) == .handled)
        #expect(root.entityPresentation.inventory == .item("item-1"))
    }

    private static let namespace = "com.knoxiolabs.pops.tests.entity-routing"
}
