import Testing

@testable import FeaturePurchases

@Suite("Receipt URI")
internal struct ReceiptURITests {
    @Test("the purchases receipt prefix exposes its hash")
    func receiptHash() {
        #expect(ReceiptURI.sha256(from: "pops://purchases/receipt/abc123") == "abc123")
    }

    @Test(
        "anything outside the stored-receipt namespace is rejected",
        arguments: ["", "manual", "pops://purchases/manual/abc", "pops://purchases/receipt/"])
    func rejectsOtherReferences(_ value: String) {
        #expect(ReceiptURI.sha256(from: value) == nil)
    }
}
