import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("PopsZoomablePhoto")
internal struct PopsZoomablePhotoTests {
    @Test("double-tap zoom enters the inspection scale from the resting scale")
    func doubleTapZoomsFromRestingScale() {
        #expect(
            PopsZoomablePhotoPresentation.scaleAfterDoubleTap(
                currentScale: PopsZoomablePhotoPresentation.minimumScale
            ) == PopsZoomablePhotoPresentation.doubleTapScale
        )
    }

    @Test(
        "double-tap returns to the resting scale from every zoomed scale",
        arguments: [
            1.1, 2.5, 6,
        ])
    func doubleTapResetsZoom(currentScale: CGFloat) {
        #expect(
            PopsZoomablePhotoPresentation.scaleAfterDoubleTap(currentScale: currentScale)
                == PopsZoomablePhotoPresentation.minimumScale
        )
    }

    @Test(
        "image bytes draw a different zoomable page from the placeholder",
        .comparisonSurvivesAnUncompiledCatalog
    )
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
