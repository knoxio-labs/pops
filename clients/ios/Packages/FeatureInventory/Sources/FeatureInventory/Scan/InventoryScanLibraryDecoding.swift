import Foundation

#if canImport(UIKit)

    import UIKit
    import Vision

    /// Reads a QR code out of a picture already on the phone, for the scan
    /// screen's Photo library control: the same payload a live scan would
    /// have decoded from the camera, routed the same way.
    internal enum InventoryScanLibraryDecoding {
        /// The first QR payload Vision finds in `data`, or nil for a picture
        /// with none, or one Vision cannot even decode as an image.
        internal static func decode(_ data: Data) -> String? {
            guard let image = UIImage(data: data), let cgImage = image.cgImage else { return nil }
            let request = VNDetectBarcodesRequest()
            request.symbologies = [.qr]
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            guard (try? handler.perform([request])) != nil else { return nil }
            return request.results?.compactMap(\.payloadStringValue).first
        }
    }

#endif
