#if canImport(VisionKit) && canImport(UIKit)

    import AppCore
    import SwiftUI
    import UIKit
    import VisionKit

    /// The system document camera, wrapped in the smallest surface that will do.
    ///
    /// `VNDocumentCameraViewController` rather than a camera built here, and
    /// rather than `DataScannerViewController`: it finds the paper's edges,
    /// corrects the perspective and collects several pages into one scan, and
    /// the alternative to it is writing all three. `DataScannerViewController`
    /// was looked at and is the wrong shape — it recognises text and barcodes in
    /// a live feed and never hands back a page image at all.
    ///
    /// ## Presented modally, and never inside a navigation stack
    ///
    /// It is presented from a `.fullScreenCover`, as a freshly-created instance that is
    /// its own delegate, and nothing in this feature puts a `NavigationStack`
    /// around it. That is not a style preference. There is an open UIKit defect
    /// where this controller's own navigation bar throws
    /// `NSInternalInconsistencyException` — "top item belongs to a different
    /// navigation bar" — immediately after a photo is captured, when it has been
    /// nested inside another navigation controller. A modal presentation is the
    /// shape that has not been seen to reproduce it.
    ///
    /// Whole-file `#if`, matching `FeaturePairing`'s scanner: there is no honest
    /// host-toolchain build of a phone camera, and a stub that compiled would be
    /// a thing a test could pass against. Every decision this feature makes
    /// lives outside this file.
    internal struct ReceiptDocumentScanner: UIViewControllerRepresentable {
        /// The prepared pages, and how many the scan actually held. The second
        /// is not derivable from the first — a page that could not be encoded is
        /// missing from one and counted in the other, which is the whole reason
        /// it is passed.
        internal let onCapture: @MainActor @Sendable ([ReceiptPart], Int) -> Void
        internal let onCancel: @MainActor @Sendable () -> Void
        internal let onFailure: @MainActor @Sendable () -> Void

        internal func makeCoordinator() -> ReceiptDocumentScannerCoordinator {
            ReceiptDocumentScannerCoordinator(
                onCapture: onCapture, onCancel: onCancel, onFailure: onFailure)
        }

        internal func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
            let scanner = VNDocumentCameraViewController()
            scanner.delegate = context.coordinator
            return scanner
        }

        /// Nothing to update. The controller is a camera, not a rendering of
        /// state: re-creating or reconfiguring it on a re-render would tear down
        /// a live capture session mid-scan.
        internal func updateUIViewController(
            _ controller: VNDocumentCameraViewController,
            context: Context
        ) {}
    }

    /// The delegate half, and the one place a scan becomes bytes.
    @MainActor
    internal final class ReceiptDocumentScannerCoordinator: NSObject {
        private let onCapture: @MainActor @Sendable ([ReceiptPart], Int) -> Void
        private let onCancel: @MainActor @Sendable () -> Void
        private let onFailure: @MainActor @Sendable () -> Void
        private let budget: ReceiptPageBudget

        internal init(
            onCapture: @escaping @MainActor @Sendable ([ReceiptPart], Int) -> Void,
            onCancel: @escaping @MainActor @Sendable () -> Void,
            onFailure: @escaping @MainActor @Sendable () -> Void,
            budget: ReceiptPageBudget = .standard
        ) {
            self.onCapture = onCapture
            self.onCancel = onCancel
            self.onFailure = onFailure
            self.budget = budget
        }

        /// Resizing and JPEG-encoding up to ``ReceiptPart/maxPerReceipt`` pages
        /// is real work, and the main thread is where the camera is still
        /// animating away. Off it, then back to report — the scanner stays on
        /// screen for the extra beat rather than the app freezing for it.
        private func prepare(_ pages: [UIImage]) {
            let budget = budget
            Task { @MainActor [onCapture] in
                let parts = await Task.detached {
                    ReceiptPageEncoder.parts(from: pages, budget: budget)
                }.value
                onCapture(parts, pages.count)
            }
        }
    }

    extension ReceiptDocumentScannerCoordinator: VNDocumentCameraViewControllerDelegate {
        /// VisionKit calls its delegate on the main queue — it is driving a view
        /// controller — which is what makes the hop below an assumption rather
        /// than a hope. `assumeIsolated` traps loudly rather than corrupting
        /// state if that ever stops being true. Same bet, and the same shape, as
        /// `FeaturePairing`'s scanner coordinator.
        internal nonisolated func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFinishWith scan: VNDocumentCameraScan
        ) {
            // Read to plain images before anything else: `VNDocumentCameraScan`
            // is not `Sendable` and is documented as valid only for the length
            // of this call, and the pages are all this needs.
            let pages = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            MainActor.assumeIsolated { prepare(pages) }
        }

        internal nonisolated func documentCameraViewControllerDidCancel(
            _ controller: VNDocumentCameraViewController
        ) {
            MainActor.assumeIsolated { onCancel() }
        }

        internal nonisolated func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFailWithError error: any Error
        ) {
            MainActor.assumeIsolated { onFailure() }
        }
    }

#endif
