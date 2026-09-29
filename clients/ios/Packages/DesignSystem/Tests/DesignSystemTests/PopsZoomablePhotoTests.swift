import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

#if os(iOS)
    import UIKit
#endif

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

    #if os(iOS)
        @Test("native zooming bounds pan and restores the resting state")
        func nativeZoomingBoundsPanAndRestoresRestingState() {
            let platform = PopsZoomablePhotoPlatform(
                data: nil,
                placeholderSymbol: "doc.text.viewfinder",
                contentMode: .fit,
                reduceMotion: true
            )
            let coordinator = platform.makeCoordinator()
            let scrollView = PopsZoomingScrollView(
                frame: CGRect(origin: .zero, size: CGSize(width: 320, height: 480))
            )
            scrollView.delegate = coordinator
            scrollView.minimumZoomScale = PopsZoomablePhotoPresentation.minimumScale
            scrollView.maximumZoomScale = PopsZoomablePhotoPresentation.maximumScale

            coordinator.install(
                content: PopsZoomablePhotoContent(
                    data: nil, placeholderSymbol: "doc.text.viewfinder", contentMode: .fit
                ),
                in: scrollView
            )
            scrollView.layoutIfNeeded()

            #expect(!scrollView.panGestureRecognizer.isEnabled)

            scrollView.setZoomScale(3, animated: false)
            scrollView.layoutIfNeeded()
            coordinator.scrollViewDidZoom(scrollView)

            #expect(scrollView.panGestureRecognizer.isEnabled)
            #expect(scrollView.contentSize.width >= scrollView.bounds.width * 3)
            #expect(scrollView.contentSize.height >= scrollView.bounds.height * 3)

            scrollView.contentOffset = CGPoint(x: 10_000, y: 10_000)
            scrollView.setZoomScale(PopsZoomablePhotoPresentation.minimumScale, animated: false)
            scrollView.layoutIfNeeded()
            coordinator.scrollViewDidZoom(scrollView)

            #expect(scrollView.zoomScale == PopsZoomablePhotoPresentation.minimumScale)
            #expect(scrollView.contentOffset == .zero)
            #expect(!scrollView.panGestureRecognizer.isEnabled)
        }
    #endif

    @Test(
        "image bytes draw a different zoomable page from the placeholder",
        .comparisonSurvivesAnUncompiledCatalog
    )
    func dataAndPlaceholderRenderDifferently() throws {
        let png = try #require(PopsTestImage.pngData(), "the fixture image could not be encoded")
        let page = { (data: Data?) in
            PopsZoomablePhotoContent(
                data: data, placeholderSymbol: "doc.text.viewfinder", contentMode: .fill
            )
            .frame(width: PopsSize.pageWidth, height: PopsSize.pageHeight)
        }

        let placeholder = try #require(PrimitiveRenderingTests.render(page(nil), in: .light))
        let photograph = try #require(PrimitiveRenderingTests.render(page(png), in: .light))

        #expect(!RenderedPixels.drawTheSame(placeholder, photograph))
    }
}
