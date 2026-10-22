#if canImport(VisionKit) && canImport(UIKit)

    import SwiftUI
    import UIKit
    import VisionKit

    /// The system document camera, handing back the scan's pages as images.
    ///
    /// `VNDocumentCameraViewController` finds the paper's edges, corrects the
    /// perspective and collects several pages into one scan; what the pages
    /// become is the caller's business.
    ///
    /// Present it from a `.fullScreenCover` and never inside a navigation
    /// stack. There is an open UIKit defect where this controller's own
    /// navigation bar throws `NSInternalInconsistencyException` right after a
    /// capture when it is nested in another navigation controller; a modal
    /// presentation has not been seen to reproduce it. A sheet would also let
    /// a swipe discard a half-finished scan with no delegate callback.
    ///
    /// Gate it on camera availability, not `VNDocumentCameraViewController.isSupported`,
    /// which answers `true` on the Simulator where no capture input exists.
    public struct PopsDocumentCamera: UIViewControllerRepresentable {
        private let onScan: @MainActor @Sendable ([UIImage]) -> Void
        private let onCancel: @MainActor @Sendable () -> Void
        private let onFailure: @MainActor @Sendable () -> Void

        public init(
            onScan: @escaping @MainActor @Sendable ([UIImage]) -> Void,
            onCancel: @escaping @MainActor @Sendable () -> Void,
            onFailure: @escaping @MainActor @Sendable () -> Void
        ) {
            self.onScan = onScan
            self.onCancel = onCancel
            self.onFailure = onFailure
        }

        public func makeCoordinator() -> PopsDocumentCameraCoordinator {
            PopsDocumentCameraCoordinator(onScan: onScan, onCancel: onCancel, onFailure: onFailure)
        }

        public func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
            let scanner = VNDocumentCameraViewController()
            scanner.delegate = context.coordinator
            return scanner
        }

        /// Nothing to update: reconfiguring the controller on a re-render
        /// would tear down a live capture session mid-scan.
        public func updateUIViewController(
            _ controller: VNDocumentCameraViewController, context: Context
        ) {}
    }

    /// ``PopsDocumentCamera``'s delegate. VisionKit calls it on the main
    /// queue, which `assumeIsolated` relies on and traps loudly without.
    @MainActor
    public final class PopsDocumentCameraCoordinator: NSObject,
        VNDocumentCameraViewControllerDelegate
    {
        private let onScan: @MainActor @Sendable ([UIImage]) -> Void
        private let onCancel: @MainActor @Sendable () -> Void
        private let onFailure: @MainActor @Sendable () -> Void

        internal init(
            onScan: @escaping @MainActor @Sendable ([UIImage]) -> Void,
            onCancel: @escaping @MainActor @Sendable () -> Void,
            onFailure: @escaping @MainActor @Sendable () -> Void
        ) {
            self.onScan = onScan
            self.onCancel = onCancel
            self.onFailure = onFailure
        }

        public nonisolated func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFinishWith scan: VNDocumentCameraScan
        ) {
            // `VNDocumentCameraScan` is valid only for the length of this
            // call and is not `Sendable`; the pages are all a caller needs.
            let pages = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            MainActor.assumeIsolated { onScan(pages) }
        }

        public nonisolated func documentCameraViewControllerDidCancel(
            _ controller: VNDocumentCameraViewController
        ) {
            MainActor.assumeIsolated { onCancel() }
        }

        public nonisolated func documentCameraViewController(
            _ controller: VNDocumentCameraViewController, didFailWithError error: any Error
        ) {
            MainActor.assumeIsolated { onFailure() }
        }
    }

#endif
