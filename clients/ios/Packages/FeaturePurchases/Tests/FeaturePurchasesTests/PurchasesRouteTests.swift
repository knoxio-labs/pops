import AppCore
import Testing

@testable import FeaturePurchases

@Suite("Purchases routes")
internal struct PurchasesRouteTests {
    @Test("archive scopes remain distinct hashable destinations")
    func archiveScopesAreDistinct() {
        let all = PurchasesScreenRoute.archive(.all)
        let unmatched = PurchasesScreenRoute.archive(.unmatched)

        #expect(all != unmatched)
        #expect(Set([all, unmatched]).count == 2)
    }

    @Test("feature-local detail routes preserve the purchase identifier")
    func screenDetailIdentifiersAreDistinct() {
        #expect(PurchasesScreenRoute.detail("a") != PurchasesScreenRoute.detail("b"))
    }

    @Test("public detail routes preserve the purchase identifier")
    func publicDetailIdentifiersAreDistinct() {
        #expect(PurchasesRoute.detail("a") != PurchasesRoute.detail("b"))
    }
}
