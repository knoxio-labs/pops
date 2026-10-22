#if canImport(VisionKit) && canImport(UIKit)

    import AppCore
    import DesignSystem
    import SwiftUI
    import UIKit

    /// The system document camera, each page of one scan becoming a JPEG
    /// `ReceiptPart`. `VNDocumentCameraViewController` rather than
    /// `DataScannerViewController`, which recognises text in a live feed and
    /// never hands back a page image. How it must be presented is
    /// `PopsDocumentCamera`'s note.
    ///
    /// Whole-file `#if`, matching `FeaturePairing`'s scanner: there is no honest
    /// host-toolchain build of a phone camera, and a stub that compiled would be
    /// a thing a test could pass against. Every decision this feature makes
    /// lives outside this file.
    internal struct ReceiptDocumentScanner: View {
        /// The prepared pages, and how many the scan actually held. The second
        /// is not derivable from the first — a page that could not be encoded is
        /// missing from one and counted in the other, which is the whole reason
        /// it is passed.
        internal let onCapture: @MainActor @Sendable ([ReceiptPart], Int) -> Void
        internal let onCancel: @MainActor @Sendable () -> Void
        internal let onFailure: @MainActor @Sendable () -> Void
        internal var budget: ReceiptPageBudget = .standard

        internal var body: some View {
            PopsDocumentCamera(
                onScan: { [onCapture, budget] pages in
                    Self.prepare(pages, budget: budget, onCapture: onCapture)
                },
                onCancel: onCancel,
                onFailure: onFailure)
        }

        /// Resizing and JPEG-encoding a scan's pages is real work, and the
        /// main thread is where the camera is still animating away. Off it,
        /// then back to report — the scanner stays on screen for the extra
        /// beat rather than the app freezing for it.
        @MainActor
        private static func prepare(
            _ pages: [UIImage], budget: ReceiptPageBudget,
            onCapture: @escaping @MainActor @Sendable ([ReceiptPart], Int) -> Void
        ) {
            Task { @MainActor in
                let parts = await Task.detached {
                    ReceiptPageEncoder.parts(from: pages, budget: budget)
                }.value
                onCapture(parts, pages.count)
            }
        }
    }

#endif
