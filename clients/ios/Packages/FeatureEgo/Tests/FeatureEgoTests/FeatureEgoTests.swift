import AppCore
import Testing

@testable import FeatureEgo

@Suite("Ego feature")
internal struct FeatureEgoTests {
    @Test("identifies the BFM Ego feature")
    func featureId() {
        #expect(FeatureEgo.feature.rawValue == "ego")
    }

    @Test("exposes non-empty display metadata")
    func displayMetadata() {
        #expect(FeatureEgo.moduleName == "FeatureEgo")
        #expect(!FeatureEgo.displayName.isEmpty)
        #expect(!FeatureEgo.symbolName.isEmpty)
    }
}
