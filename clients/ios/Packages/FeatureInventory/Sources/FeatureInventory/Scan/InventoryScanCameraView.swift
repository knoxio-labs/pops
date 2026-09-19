#if canImport(UIKit)

    import AppCore
    import SwiftUI
    import UIKit

    /// The camera, full-bleed behind the reticle. `AppCore.QRScannerCoordinator`
    /// is the same one `FeaturePairing`'s scanner drives; nothing about reading
    /// a QR code is Inventory-specific, only what a decoded payload means.
    internal struct InventoryScanCameraView: UIViewRepresentable {
        internal let onScan: (String) -> Bool

        internal func makeCoordinator() -> QRScannerCoordinator {
            QRScannerCoordinator(onScan: onScan)
        }

        internal func makeUIView(context: Context) -> QRScannerPreviewView {
            let view = QRScannerPreviewView()
            context.coordinator.start(previewing: view)
            return view
        }

        /// The closure is replaced rather than the coordinator rebuilt: a
        /// rebuild would tear the capture session down and up on every body
        /// evaluation, which reads as the preview strobing.
        internal func updateUIView(_ view: QRScannerPreviewView, context: Context) {
            context.coordinator.onScan = onScan
        }

        internal static func dismantleUIView(
            _ view: QRScannerPreviewView, coordinator: QRScannerCoordinator
        ) {
            coordinator.stop()
        }
    }

#endif
