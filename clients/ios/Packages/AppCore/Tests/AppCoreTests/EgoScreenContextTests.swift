import Testing

@testable import AppCore

@Suite("Ego screen context")
internal struct EgoScreenContextTests {
    @Test(
        "known features map to their owning pillars",
        arguments: [
            (MobileFeature.transactions, "finance"),
            (MobileFeature.accounts, "finance"),
            (MobileFeature.purchases, "purchases"),
            (MobileFeature(rawValue: "inventory"), "inventory"),
        ])
    func featureMapsToPillar(feature: MobileFeature, expectedApp: String) {
        let context = makeEgoAppContext(feature: feature, routerPath: [], presentedObjectURI: nil)

        #expect(context?.app == expectedApp)
        #expect(context?.uri == nil)
        #expect(context?.route == nil)
        #expect(context?.entityTitle == nil)
    }

    @Test("transaction detail routes produce finance object URIs")
    func transactionDetail() {
        let context = makeEgoAppContext(
            feature: .transactions,
            routerPath: [.transactionDetail(id: "t1")],
            presentedObjectURI: nil)

        #expect(context?.app == "finance")
        #expect(context?.uri == "pops:finance/transaction/t1")
    }

    @Test("account detail routes produce finance object URIs")
    func accountDetail() {
        let context = makeEgoAppContext(
            feature: .accounts,
            routerPath: [.accountDetail(id: "a1")],
            presentedObjectURI: nil)

        #expect(context?.app == "finance")
        #expect(context?.uri == "pops:finance/account/a1")
    }

    @Test(
        "list routes do not produce object URIs",
        arguments: [Route.transactionList, .accountsList])
    func listRouteHasNoURI(route: Route) {
        let context = makeEgoAppContext(
            feature: .transactions, routerPath: [route], presentedObjectURI: nil)

        #expect(context?.uri == nil)
    }

    @Test("a presented object URI takes precedence over the router path")
    func presentedURIWins() {
        let presentedURI = "pops:inventory/item/18"
        let context = makeEgoAppContext(
            feature: .transactions,
            routerPath: [.transactionDetail(id: "t1")],
            presentedObjectURI: presentedURI)

        #expect(context?.app == "finance")
        #expect(context?.uri == presentedURI)
    }

    @Test("a presented object URI supplies the app when there is no feature")
    func presentedURIProvidesApp() {
        let context = makeEgoAppContext(
            feature: nil,
            routerPath: [],
            presentedObjectURI: "pops:inventory/item/18")

        #expect(context?.app == "inventory")
        #expect(context?.uri == "pops:inventory/item/18")
    }

    @Test("a featureless screen without a presented object has no context")
    func noFeatureOrPresentedURI() {
        #expect(
            makeEgoAppContext(
                feature: nil,
                routerPath: [.transactionDetail(id: "t1")],
                presentedObjectURI: nil) == nil)
    }

    @Test("a malformed presented URI cannot supply an app without a feature")
    func malformedPresentedURIWithoutFeature() {
        #expect(
            makeEgoAppContext(
                feature: nil,
                routerPath: [],
                presentedObjectURI: "not a uri") == nil)
    }

    @Test("unknown feature ids keep their own app id")
    func unknownFeature() {
        let context = makeEgoAppContext(
            feature: MobileFeature(rawValue: "future-feature"),
            routerPath: [],
            presentedObjectURI: nil)

        #expect(context?.app == "future-feature")
    }
}
