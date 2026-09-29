import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// A genuine, tiny encoded image, for suites that have to prove a view drew a
/// picture rather than a placeholder.
///
/// Built rather than pasted in as a base64 blob: a literal nobody can read is
/// a fixture nobody can check, and this one has to actually satisfy a platform
/// image decoder for any assertion resting on it to mean anything.
///
/// It lives in this target for the same reason `HostToolchainColorSupport`
/// does — every package that rasterises a view needs it, and a copy per test
/// target is a fixture that drifts.
public enum PopsTestImage {
    /// A small opaque PNG. `nil` only if the platform's own encoder refused,
    /// which callers should surface rather than skip past: a fixture that
    /// silently became `nil` turns "the picture is drawn" into a comparison
    /// between two placeholders.
    /// - Parameters:
    ///   - width: Encoded pixel width.
    ///   - height: Encoded pixel height.
    public static func pngData(width: Int = 4, height: Int = 4) -> Data? {
        guard
            let context = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        context.setFillColor(red: 0.9, green: 0.1, blue: 0.1, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))

        guard let image = context.makeImage() else { return nil }
        let encoded = NSMutableData()
        guard
            let destination = CGImageDestinationCreateWithData(
                encoded, UTType.png.identifier as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return encoded as Data
    }
}
