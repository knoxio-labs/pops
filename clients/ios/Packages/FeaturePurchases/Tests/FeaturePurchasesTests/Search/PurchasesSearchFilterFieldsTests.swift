import AppCore
import Testing

@testable import FeaturePurchases

@Suite("Purchases search filter fields")
internal struct PurchasesSearchFilterFieldsTests {
    @Test("the Show picker offers any, purchases then lines, titled for the reader")
    internal func kindOptions() {
        #expect(purchasesSearchKindOptions() == [.any, .purchases, .lines])
        #expect(purchasesSearchKindOptions().map(\.title) == ["Any", "Purchases", "Products"])
    }

    @Test("the Status picker offers every settlement, any first")
    internal func statusOptions() {
        #expect(
            purchasesSearchStatusOptions() == [
                .any, .unmatched, .matched, .partial, .cash, .ignored,
            ])
        #expect(
            purchasesSearchStatusOptions().map(\.title) == [
                "Any", "Unmatched", "Matched", "Part matched", "Cash", "Ignored",
            ])
    }
}
