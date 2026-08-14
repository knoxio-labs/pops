import AppCore
import FeatureReceiptCapture
import Testing

@Suite("FeatureReceiptCapture")
internal struct FeatureReceiptCaptureTests {
    @Test("the module names itself and the BFM feature it draws")
    func moduleIdentity() {
        #expect(FeatureReceiptCapture.moduleName == "FeatureReceiptCapture")
        #expect(FeatureReceiptCapture.feature == MobileFeature.receiptCapture)
    }
}
