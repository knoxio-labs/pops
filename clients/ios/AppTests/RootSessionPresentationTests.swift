import AppCore
import Foundation
import Testing

@testable import Pops

@Suite("Root session presentation")
internal struct RootSessionPresentationTests {
    @Test("revocation dismisses a selected More feature")
    func revocationDismissesMoreFeature() {
        let selected = MobileFeature(rawValue: "transactions")

        #expect(
            RootView.moreFeatureSelection(
                selected, after: .revoked(.revokedByOperator)) == nil)
    }

    @Test("a paired session keeps the selected More feature")
    func pairedSessionKeepsMoreFeature() {
        let selected = MobileFeature(rawValue: "transactions")
        let state = SessionState.paired(
            PairedDevice(id: "device-1", baseURL: URL(fileURLWithPath: "/")))

        #expect(RootView.moreFeatureSelection(selected, after: state) == selected)
    }
}
