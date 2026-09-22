import Testing

@testable import FeaturePurchases

@Suite("Purchase staging copy")
internal struct PurchaseStagingCopyTests {
    @Test(
        "the title counts receipts",
        arguments: [
            (0, "Receipts"),
            (1, "1 receipt"),
            (5, "5 receipts"),
        ])
    func title(receiptCount: Int, expected: String) {
        #expect(PurchaseStagingCopy.title(receiptCount: receiptCount) == expected)
    }

    @Test(
        "discard copy counts pages",
        arguments: [
            (1, "Discard this page?"),
            (3, "Discard these 3 pages?"),
        ])
    func discardTitle(pageCount: Int, expected: String) {
        #expect(PurchaseStagingCopy.discardTitle(pageCount: pageCount) == expected)
    }
}
