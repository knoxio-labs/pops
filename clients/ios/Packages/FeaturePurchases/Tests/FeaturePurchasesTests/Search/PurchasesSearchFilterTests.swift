import AppCore
import Testing

@testable import FeaturePurchases

@Suite("Purchases search filter")
internal struct PurchasesSearchFilterTests {
    @Test("a default filter is inactive and has an empty summary")
    internal func defaultIsInactive() {
        let filter = PurchasesSearchFilter()

        #expect(!filter.isActive)
        #expect(filter.summary.isEmpty)
    }

    @Test("kind alone names itself in the summary")
    internal func kindAlone() {
        let filter = PurchasesSearchFilter(kind: .lines)

        #expect(filter.isActive)
        #expect(filter.summary == "Products")
    }

    @Test("status alone names itself in the summary")
    internal func statusAlone() {
        let filter = PurchasesSearchFilter(status: .matched)

        #expect(filter.isActive)
        #expect(filter.summary == "Matched")
    }

    @Test("kind and status both narrowed are named kind then status")
    internal func kindThenStatus() {
        let filter = PurchasesSearchFilter(kind: .purchases, status: .partial)

        #expect(filter.summary == "Purchases, Part matched")
    }
}
