import Testing

@testable import Pops

@Suite("ContentView accessibility wiring")
internal struct ContentViewAccessibilityWiringTests {
    @Test("the More tab exposes the identifier used by the UI flow")
    func moreTabAccessibilityIsWired() {
        #expect(
            ContentViewFeatureSwitchingWiringTests.contentViewSource.contains(
                ".accessibilityIdentifier(Self.moreTabAccessibilityIdentifier)"
            )
        )
    }
}
