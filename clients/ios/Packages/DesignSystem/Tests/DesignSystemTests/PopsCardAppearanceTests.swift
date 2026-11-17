import DesignSystemTestSupport
import SwiftUI
import Testing

@testable import DesignSystem

@Suite("Card appearances")
@MainActor
internal struct PopsCardAppearanceTests {
    @Test(
        "featured cards change shape while the default keeps its original appearance",
        .requiresCompiledColorCatalog)
    internal func featuredCard() throws {
        let content = PopsRow(title: "Recorded visit", subtitle: "Dates not set")
        for scheme in ColorScheme.allCases {
            let original = try #require(
                PrimitiveRenderingTests.render(PopsCard { content }, in: scheme))
            let standard = try #require(
                PrimitiveRenderingTests.render(
                    PopsCard(appearance: .standard) { content }, in: scheme))
            let featured = try #require(
                PrimitiveRenderingTests.render(
                    PopsCard(appearance: .featured) { content }, in: scheme))
            #expect(RenderedPixels.drawTheSame(original, standard))
            #expect(original != featured)
        }
    }
}
