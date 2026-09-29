import SwiftUI

#if os(iOS)
    import UIKit

    internal struct PopsZoomablePhotoPlatform: UIViewRepresentable {
        let data: Data?
        let placeholderSymbol: String
        let contentMode: ContentMode
        let reduceMotion: Bool

        func makeCoordinator() -> Coordinator {
            Coordinator(reduceMotion: reduceMotion)
        }

        func makeUIView(context: Context) -> PopsZoomingScrollView {
            let scrollView = PopsZoomingScrollView()
            scrollView.delegate = context.coordinator
            scrollView.minimumZoomScale = PopsZoomablePhotoPresentation.minimumScale
            scrollView.maximumZoomScale = PopsZoomablePhotoPresentation.maximumScale
            scrollView.bounces = true
            scrollView.bouncesZoom = true
            scrollView.clipsToBounds = true
            scrollView.contentInsetAdjustmentBehavior = .never
            scrollView.showsHorizontalScrollIndicator = false
            scrollView.showsVerticalScrollIndicator = false
            context.coordinator.install(
                content: PopsZoomablePhotoContent(
                    data: data, placeholderSymbol: placeholderSymbol, contentMode: contentMode
                ),
                in: scrollView
            )
            return scrollView
        }

        func updateUIView(_ scrollView: PopsZoomingScrollView, context: Context) {
            context.coordinator.reduceMotion = reduceMotion
            context.coordinator.update(
                content: PopsZoomablePhotoContent(
                    data: data, placeholderSymbol: placeholderSymbol, contentMode: contentMode
                ),
                in: scrollView
            )
        }

        @MainActor
        final class Coordinator: NSObject, UIScrollViewDelegate {
            var reduceMotion: Bool

            private var hostingController: UIHostingController<PopsZoomablePhotoContent>?

            init(reduceMotion: Bool) {
                self.reduceMotion = reduceMotion
            }

            func install(content: PopsZoomablePhotoContent, in scrollView: PopsZoomingScrollView) {
                let hostingController = UIHostingController(rootView: content)
                hostingController.view.frame = scrollView.bounds
                hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                scrollView.addSubview(hostingController.view)
                scrollView.zoomedView = hostingController.view
                scrollView.contentSize = scrollView.bounds.size
                scrollView.panGestureRecognizer.isEnabled = false
                self.hostingController = hostingController

                let doubleTap = UITapGestureRecognizer(
                    target: self, action: #selector(handleDoubleTap(_:))
                )
                doubleTap.numberOfTapsRequired = 2
                scrollView.addGestureRecognizer(doubleTap)
            }

            func update(content: PopsZoomablePhotoContent, in scrollView: PopsZoomingScrollView) {
                hostingController?.rootView = content
                scrollView.zoomedView = hostingController?.view
            }

            func viewForZooming(in _: UIScrollView) -> UIView? {
                hostingController?.view
            }

            func scrollViewDidZoom(_ scrollView: UIScrollView) {
                guard let scrollView = scrollView as? PopsZoomingScrollView else { return }
                scrollView.updatePanGestureAvailability()
            }

            func scrollViewDidEndZooming(
                _ scrollView: UIScrollView, with _: UIView?, atScale _: CGFloat
            ) {
                guard let scrollView = scrollView as? PopsZoomingScrollView else { return }
                scrollView.updatePanGestureAvailability()
            }

            @objc private func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
                guard let scrollView = recognizer.view as? PopsZoomingScrollView else { return }
                let targetScale = PopsZoomablePhotoPresentation.scaleAfterDoubleTap(
                    currentScale: scrollView.zoomScale
                )
                scrollView.setZoomScale(targetScale, animated: !reduceMotion)
            }
        }
    }

    internal final class PopsZoomingScrollView: UIScrollView {
        var zoomedView: UIView?

        override func layoutSubviews() {
            super.layoutSubviews()
            guard let zoomedView, zoomScale == minimumZoomScale else { return }

            let frame = CGRect(origin: .zero, size: bounds.size)
            if zoomedView.frame != frame {
                zoomedView.frame = frame
                contentSize = bounds.size
                contentOffset = .zero
            }
        }

        func updatePanGestureAvailability() {
            let isZoomed = zoomScale > minimumZoomScale
            if panGestureRecognizer.isEnabled != isZoomed {
                panGestureRecognizer.isEnabled = isZoomed
            }
        }
    }
#else
    internal struct PopsZoomablePhotoPlatform: View {
        let data: Data?
        let placeholderSymbol: String
        let contentMode: ContentMode
        let reduceMotion: Bool

        var body: some View {
            PopsPhoto(
                data: data, placeholderSymbol: placeholderSymbol, contentMode: contentMode
            )
            .padding(PopsSpacing.xl)
        }
    }
#endif

internal struct PopsZoomablePhotoContent: View {
    let data: Data?
    let placeholderSymbol: String
    let contentMode: ContentMode

    var body: some View {
        PopsPhoto(
            data: data, placeholderSymbol: placeholderSymbol, contentMode: contentMode
        )
        .padding(PopsSpacing.xl)
    }
}
