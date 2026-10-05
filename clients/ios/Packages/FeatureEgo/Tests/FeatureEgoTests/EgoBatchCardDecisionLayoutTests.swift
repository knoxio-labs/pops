import SwiftUI
import Testing

@testable import FeatureEgo

@Suite("Ego batch card decision layout")
internal struct EgoBatchCardDecisionLayoutTests {
    @Test("decision controls stack at accessibility text sizes")
    func decisionControlsStackAtAccessibilityTextSizes() {
        #expect(EgoBatchCardDecisionLayout.resolve(for: .large) == .inline)
        #expect(EgoBatchCardDecisionLayout.resolve(for: .accessibility1) == .stacked)
        #expect(EgoBatchCardDecisionLayout.resolve(for: .accessibility3) == .stacked)
    }
}
