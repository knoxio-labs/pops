#if canImport(UIKit)

    import AVFoundation
    import DesignSystem
    import SwiftUI
    import UIKit

    /// The camera, wrapped in the smallest surface that will do.
    ///
    /// Whole-file `#if` rather than a shimmed cross-platform variant: there is
    /// no honest macOS build of a phone's QR scanner, and a stub that compiled
    /// would be a thing tests could pass against. The package's host build
    /// exists to exercise the *decisions* — which error is shown, what a scanned
    /// payload means — and every one of those lives outside this file.
    internal struct QRScannerSheet: View {
        /// Returns `true` when the payload was a pairing link and the sheet
        /// should close. Anything else means keep looking.
        internal let onScan: (String) -> Bool
        internal let onCancel: () -> Void

        internal var body: some View {
            VStack(spacing: PopsSpacing.lg) {
                Text(PairingCopy.scannerInstruction)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                    .multilineTextAlignment(.center)

                QRScannerView(onScan: onScan)
                    .clipShape(RoundedRectangle(cornerRadius: PopsRadius.card))
                    .accessibilityLabel(PairingCopy.scannerInstruction)

                PopsButton(PairingCopy.scannerCancel, action: onCancel)
            }
            .padding(PopsSpacing.lg)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
        }
    }

    internal struct QRScannerView: UIViewRepresentable {
        internal let onScan: (String) -> Bool

        internal func makeCoordinator() -> QRScannerCoordinator {
            QRScannerCoordinator(onScan: onScan)
        }

        internal func makeUIView(context: Context) -> QRScannerPreviewView {
            let view = QRScannerPreviewView()
            context.coordinator.start(previewing: view)
            return view
        }

        /// The closure is replaced rather than the coordinator rebuilt: SwiftUI
        /// re-runs `body` for every keystroke in the form underneath, and
        /// tearing the capture session down and up on each one would make the
        /// preview strobe.
        internal func updateUIView(_ view: QRScannerPreviewView, context: Context) {
            context.coordinator.onScan = onScan
        }

        internal static func dismantleUIView(
            _ view: QRScannerPreviewView,
            coordinator: QRScannerCoordinator
        ) {
            coordinator.stop()
        }
    }

    /// A `UIView` whose backing layer *is* the preview layer.
    ///
    /// Adding a sublayer instead is the usual mistake: a sublayer does not
    /// participate in Auto Layout, so it keeps its initial bounds and the
    /// preview ends up the wrong size the first time the device rotates.
    internal final class QRScannerPreviewView: UIView {
        internal override static var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

        internal var previewLayer: AVCaptureVideoPreviewLayer {
            // Guaranteed by `layerClass` above; there is no path where UIKit
            // hands back a layer of a different class.
            guard let layer = layer as? AVCaptureVideoPreviewLayer else {
                preconditionFailure("layerClass promises an AVCaptureVideoPreviewLayer")
            }
            return layer
        }
    }

#endif
