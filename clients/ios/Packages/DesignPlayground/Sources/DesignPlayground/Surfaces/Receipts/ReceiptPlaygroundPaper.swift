import AppCore
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// A drawing of a till receipt — a pale page with darker bars where the print
/// would be — turned into real JPEG bytes.
///
/// Synthesised rather than checked in as a fixture image: a receipt
/// photograph in a repository is somebody's real shopping, and every state in
/// this area needs something that actually draws in `PopsPhoto` rather than a
/// row of placeholders. Neither `CoreGraphics` nor `ImageIO` is UIKit or
/// AppKit, so this compiles and runs on the macOS host the same as on iOS.
internal enum ReceiptPlaygroundPaper {
    /// `count` pages, each a distinct drawing so a multi-page receipt does not
    /// look like the same photograph repeated.
    internal static func pages(_ count: Int) -> [ReceiptPart] {
        (0..<max(count, 0)).compactMap { index in
            jpegData(seed: index).map { ReceiptPart(mediaType: .jpeg, data: $0) }
        }
    }

    private static func jpegData(seed: Int) -> Data? {
        let width = 240
        let height = 360
        guard
            let context = CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }

        context.setFillColor(red: 0.96, green: 0.95, blue: 0.92, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.setFillColor(red: 0.25, green: 0.24, blue: 0.22, alpha: 1)

        var line = height - 40
        var index = 0
        while line > 24 {
            let inset = 24
            let barWidth = (index + seed) % 3 == 0 ? width - inset * 2 : width / 2
            context.fill(CGRect(x: inset, y: line, width: barWidth, height: 6))
            line -= 22
            index += 1
        }

        return encode(context.makeImage())
    }

    private static func encode(_ image: CGImage?) -> Data? {
        guard let image else { return nil }
        let encoded = NSMutableData()
        guard
            let destination = CGImageDestinationCreateWithData(
                encoded, UTType.jpeg.identifier as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return encoded as Data
    }
}
