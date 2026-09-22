import AppCore
import FeaturePurchases
import Testing

@Suite("Receipt capture tab")
internal struct ReceiptCaptureTabTests {
    @Test("the tab keeps its feature, label and icon")
    func tabIdentity() {
        #expect(ReceiptCaptureTab.feature == MobileFeature.receiptCapture)
        #expect(ReceiptCaptureTab.displayName == "Receipts")
        #expect(ReceiptCaptureTab.symbolName == "doc.text.viewfinder")
    }
}
