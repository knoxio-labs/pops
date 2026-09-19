import CryptoKit
import Foundation

/// A photo's content hash, the thing every reference to it is addressed by
/// (ADR-002 D9). Deterministic and platform-independent: two captures of the
/// same encoded bytes hash the same, which is the property `item.attachPhoto`
/// leans on to make re-sending idempotent.
internal enum InventoryPhotoHashing {
    internal static func sha256(of data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

#if canImport(UIKit)

    import UIKit

    /// Downscaling and re-encoding a capture before it ever reaches the
    /// network: the media route caps a body at 8 MB, and a modern phone's
    /// original is routinely several times that. 2048 px on the long edge is
    /// this slice's fixed target (ADR-002's media route derives its own
    /// 256 px/1024 px variants from whatever this uploads).
    internal enum InventoryPhotoEncoding {
        internal static let longEdge: CGFloat = 2048
        private static let jpegQuality: CGFloat = 0.85

        internal static func jpeg(from image: UIImage) -> Data? {
            resized(image, longEdge: longEdge).jpegData(compressionQuality: jpegQuality)
        }

        internal static func resized(_ image: UIImage, longEdge: CGFloat) -> UIImage {
            let size = image.size
            let longest = max(size.width, size.height)
            guard longest > longEdge, longest > 0 else { return image }
            let scale = longEdge / longest
            let target = CGSize(width: size.width * scale, height: size.height * scale)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            let renderer = UIGraphicsImageRenderer(size: target, format: format)
            return renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: target))
            }
        }
    }

#endif
