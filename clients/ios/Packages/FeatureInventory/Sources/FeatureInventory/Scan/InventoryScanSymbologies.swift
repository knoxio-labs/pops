#if canImport(UIKit)

    import AVFoundation
    import Vision

    /// What the Inventory scanner reads: its own QR labels, and the product
    /// barcodes and ISBNs items carry as external identifiers. Listed once per
    /// framework so the live camera and a library photo read the same codes.
    internal enum InventoryScanSymbologies {
        internal static let camera: [AVMetadataObject.ObjectType] = [
            .qr, .dataMatrix, .ean13, .ean8, .upce, .code128, .code39, .code93, .itf14,
            .interleaved2of5,
        ]

        internal static let library: [VNBarcodeSymbology] = [
            .qr, .dataMatrix, .ean13, .ean8, .upce, .code128, .code39, .code93, .itf14, .i2of5,
        ]
    }

#endif
