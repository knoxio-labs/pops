import AppCore
import DesignSystem
import SwiftUI
import Testing
import UIKit

@testable import Pops

@Suite("ContentView feature switching")
@MainActor
internal struct ContentViewEmptyStateRenderingTests {
    @Test("zero available features renders real content rather than a blank screen")
    func zeroFeaturesRendersRealContent() async throws {
        let adaptiveFlat = Color(
            uiColor: UIColor { traits in
                traits.userInterfaceStyle == .dark ? .red : .blue
            })

        #expect(
            try await SwiftUIViewRendering.rendersSchemeAwareContent(
                ContentViewFixture.view(available: []).features,
                background: Color.popsBackground))
        #expect(
            !(try await SwiftUIViewRendering.rendersSchemeAwareContent(
                Color.clear, background: Color.popsBackground)))
        #expect(
            !(try await SwiftUIViewRendering.rendersSchemeAwareContent(
                Color.popsBackground, background: Color.popsBackground)))
        #expect(
            !(try await SwiftUIViewRendering.rendersSchemeAwareContent(
                adaptiveFlat.ignoresSafeArea(), background: Color.popsBackground)))
    }

    @Test("receipt-capture alone renders the nothing-available explanation")
    func receiptCaptureAloneRendersNothingAvailable() async throws {
        #expect(
            try await SwiftUIViewRendering.rendersSchemeAwareContent(
                ContentViewFixture.view(available: [.receiptCapture]).features,
                background: Color.popsBackground))
    }
}
