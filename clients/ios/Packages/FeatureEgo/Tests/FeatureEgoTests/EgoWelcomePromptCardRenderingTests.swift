import DesignSystemTestSupport
import SwiftUI
import Testing

@testable import FeatureEgo

#if os(iOS)
    @Suite("Ego welcome prompt cards under Dynamic Type")
    @MainActor
    internal struct EgoWelcomePromptCardRenderingTests {
        @Test(
            "prompt details remain visible across wrapped lines at AX3",
            .requiresCompiledColorCatalog)
        func detailWrapsAtAccessibilitySize() throws {
            let sharedDetail = String(
                repeating: "A quick look at recent purchases shows spending trends. ", count: 8)
            let first = try #require(
                Self.render(detail: "\(sharedDetail)It ends with merchant names."))
            let second = try #require(
                Self.render(detail: "\(sharedDetail)It ends with category names."))

            #expect(first != second)
        }

        private static func render(detail: String) -> Data? {
            let suggestion = EgoWelcomePrompt(
                id: "rendering",
                title: "Review recent activity",
                detail: detail,
                symbol: "chart.xyaxis.line",
                prompt: "Summarize recent activity."
            )
            let renderer = ImageRenderer(
                content: EgoWelcomePromptCard(suggestion: suggestion, onChoose: { _ in })
                    .dynamicTypeSize(.accessibility3)
                    .frame(width: 320)
            )
            renderer.scale = 1
            guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
                return nil
            }
            return pixels as Data
        }
    }
#endif
