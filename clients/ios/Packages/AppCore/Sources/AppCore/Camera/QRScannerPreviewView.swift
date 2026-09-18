#if canImport(UIKit)

    import AVFoundation
    import UIKit

    /// A `UIView` whose backing layer *is* the preview layer.
    ///
    /// Adding a sublayer instead is the usual mistake: a sublayer does not
    /// participate in Auto Layout, so it keeps its initial bounds and the
    /// preview ends up the wrong size the first time the device rotates.
    public final class QRScannerPreviewView: UIView {
        public override static var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

        public var previewLayer: AVCaptureVideoPreviewLayer {
            // Guaranteed by `layerClass` above; there is no path where UIKit
            // hands back a layer of a different class.
            guard let layer = layer as? AVCaptureVideoPreviewLayer else {
                preconditionFailure("layerClass promises an AVCaptureVideoPreviewLayer")
            }
            return layer
        }
    }

#endif
