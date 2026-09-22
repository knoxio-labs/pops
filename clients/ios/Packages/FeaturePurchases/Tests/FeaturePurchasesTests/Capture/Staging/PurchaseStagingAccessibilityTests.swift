import Testing

@testable import FeaturePurchases

@Suite("Purchase staging accessibility")
internal struct PurchaseStagingAccessibilityTests {
    @Test("every staging and viewer control has a distinct stable identifier")
    func identifiers() {
        let identifiers = [
            PurchaseStagingAccessibility.root,
            PurchaseStagingAccessibility.read,
            PurchaseStagingAccessibility.cancel,
            PurchaseStagingAccessibility.tile("page"),
            PurchaseStagingAccessibility.add,
            PurchaseStagingAccessibility.looseWell,
            PurchaseStagingAccessibility.viewerReplace,
            PurchaseStagingAccessibility.viewerDelete,
            PurchaseStagingAccessibility.viewerClose,
        ]

        #expect(Set(identifiers).count == identifiers.count)
        #expect(identifiers.allSatisfy { !$0.isEmpty })
        #expect(PurchaseStagingAccessibility.tile("other") != identifiers[3])
    }
}
