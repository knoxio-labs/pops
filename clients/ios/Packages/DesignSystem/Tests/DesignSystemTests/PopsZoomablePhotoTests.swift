import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("PopsZoomablePhoto")
internal struct PopsZoomablePhotoTests {
    @Test("pan converts zoomed local translation to screen movement")
    func panTranslationScalesWithZoom() {
        let offset = PopsZoomablePhotoPresentation.offset(
            committedOffset: CGSize(width: 12, height: -8),
            translation: CGSize(width: 40, height: -20),
            scale: 4
        )

        #expect(offset.width == 172)
        #expect(offset.height == -88)
    }

    @Test("pan never amplifies translation below one-to-one scale")
    func panTranslationHasBaseScaleFloor() {
        let offset = PopsZoomablePhotoPresentation.offset(
            committedOffset: .zero,
            translation: CGSize(width: 40, height: -20),
            scale: 0.5
        )

        #expect(offset.width == 40)
        #expect(offset.height == -20)
    }

    @Test(
        "image bytes draw a different zoomable page from the placeholder",
        .comparisonSurvivesAnUncompiledCatalog)
    func dataAndPlaceholderRenderDifferently() throws {
        let png = try #require(PopsTestImage.pngData(), "the fixture image could not be encoded")
        let page = { (data: Data?) in
            PopsZoomablePhoto(data: data, placeholderSymbol: "doc.text.viewfinder")
                .frame(width: PopsSize.pageWidth, height: PopsSize.pageHeight)
        }

        let placeholder = try #require(PrimitiveRenderingTests.render(page(nil), in: .light))
        let photograph = try #require(PrimitiveRenderingTests.render(page(png), in: .light))

        #expect(!RenderedPixels.drawTheSame(placeholder, photograph))
    }
}
