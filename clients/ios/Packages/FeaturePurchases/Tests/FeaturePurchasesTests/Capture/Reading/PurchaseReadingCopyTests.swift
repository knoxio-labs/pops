import Testing

@testable import FeaturePurchases

@Suite("Purchase reading copy")
internal struct PurchaseReadingCopyTests {
    @Test(
        "the subtitle reports progress until every receipt is done",
        arguments: [
            (0, 3, "0 of 3"),
            (2, 3, "2 of 3"),
            (3, 3, "All 3 done"),
        ])
    func subtitle(done: Int, total: Int, expected: String) {
        #expect(PurchaseReadingCopy.subtitle(done: done, total: total) == expected)
    }

    @Test(
        "item copy uses singular only for one",
        arguments: [
            (1, "1 item"),
            (23, "23 items"),
        ])
    func items(count: Int, expected: String) {
        #expect(PurchaseReadingCopy.items(count) == expected)
    }

    @Test("a row whose reading has no merchant names the absence")
    func unnamedMerchant() {
        #expect(PurchaseReadingCopy.merchant(nil) == "Unnamed merchant")
        #expect(PurchaseReadingCopy.merchant("Corner Store") == "Corner Store")
    }

    @Test("unfinished and failed rows use the approved labels")
    func rowLabels() {
        #expect(PurchaseReadingCopy.waiting == "Waiting")
        #expect(PurchaseReadingCopy.unreadable == "Unreadable")
    }

    @Test("the screen and both navigation actions keep stable identifiers")
    func accessibilityIdentifiers() {
        #expect(PurchaseReadingAccessibility.root == "purchases-reading")
        #expect(PurchaseReadingAccessibility.cancel == "purchases-reading-cancel")
        #expect(PurchaseReadingAccessibility.review == "purchases-reading-review")
    }
}
