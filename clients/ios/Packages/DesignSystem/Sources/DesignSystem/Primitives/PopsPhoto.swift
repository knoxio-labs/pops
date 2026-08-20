import CoreGraphics
import Foundation
import ImageIO
import SwiftUI

/// A photograph the app is holding as bytes, drawn as a plate: rounded,
/// bordered, filling whatever frame the caller gives it.
///
/// `data` is optional and `nil` is an ordinary case rather than a failure
/// path — the plate with nothing in it is the empty state of the thing that
/// will hold a photograph, and drawing both from one type is what makes the
/// placeholder and the picture the same object at the same size rather than
/// two unrelated layouts that swap.
///
/// Bytes rather than an `Image`, because that is what the app has: a capture
/// is `Data` from the moment the camera hands it over until it is uploaded,
/// and a caller that had to decode first would be a caller writing
/// `UIImage(data:)` in a feature module — a platform type in a place that
/// compiles for two platforms.
///
/// ## ImageIO rather than `UIImage`/`NSImage`
///
/// This package builds for iOS and for the host toolchain, and the obvious
/// decode is `UIImage(data:)` on one and `NSImage(data:)` on the other behind
/// a `#if canImport`. ImageIO is on both, so there is no conditional at all —
/// and the thumbnail path below applies the file's own orientation transform
/// and downsamples in one step, which the platform initialisers would each
/// need separate help with.
///
/// ## The decode is synchronous, and that is a bounded claim
///
/// `body` decodes on every evaluation, at a bounded pixel count rather than at
/// the file's own. That is affordable here: the app's photographs are receipt
/// pages, which are capped in edge length and JPEG quality before they are
/// ever held, and a screen shows a handful of them. A surface drawing a
/// scrolling list of these wants a decoded image handed in and cached instead
/// — that is a different initialiser, not a bigger `body`.
public struct PopsPhoto: View {
    private let data: Data?
    private let placeholderSymbol: String

    /// - Parameters:
    ///   - data: the encoded image. `nil`, or bytes no decoder here
    ///     recognises, draws the placeholder.
    ///   - placeholderSymbol: the SF Symbol drawn when there is no picture —
    ///     what the plate is *for*, so an empty one still says something.
    public init(data: Data?, placeholderSymbol: String) {
        self.data = data
        self.placeholderSymbol = placeholderSymbol
    }

    public var body: some View {
        plate
            .clipShape(RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
    }

    @ViewBuilder private var plate: some View {
        ZStack {
            Color.popsSurface
            if let image = Self.decode(data) {
                image
                    .resizable()
                    .scaledToFill()
            } else {
                Image(systemName: placeholderSymbol)
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    /// Whether these bytes are a picture this build can draw.
    ///
    /// `internal` rather than private so a test can ask the question without
    /// rasterising anything — on a lane where the colour catalogue did not
    /// compile, a picture and a placeholder rasterise to the same nothing, so
    /// the render comparison cannot answer it and this can.
    internal nonisolated static func isDecodable(_ data: Data?) -> Bool {
        decode(data) != nil
    }

    /// The longest edge the decoded bitmap is allowed to have.
    ///
    /// A decode budget rather than a layout metric, which is why it is not on
    /// a scale in `Tokens/`: it bounds how much memory a plate costs, and the
    /// frame the caller gives the plate decides how big it looks. Generous
    /// enough that a page still reads at the largest Dynamic Type sizes on a
    /// modern screen, and far below a camera's own output.
    private nonisolated static let maximumDecodedEdge = 1_024

    private nonisolated static func decode(_ data: Data?) -> Image? {
        guard let data, !data.isEmpty,
            let source = CGImageSourceCreateWithData(data as CFData, nil)
        else { return nil }

        // `WithTransform` applies the file's own orientation, so a photograph
        // taken sideways is drawn upright without this having to read and map
        // the EXIF tag itself. `FromImageAlways` because a file carrying an
        // embedded thumbnail would otherwise be drawn at whatever size that
        // thumbnail happens to be.
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maximumDecodedEdge,
        ]
        guard
            let image = CGImageSourceCreateThumbnailAtIndex(
                source, 0, options as CFDictionary)
        else { return nil }

        // `decorative` because the caller labels the plate. An `Image` given a
        // label here would announce itself underneath whatever the caller said.
        return Image(decorative: image, scale: 1)
    }
}

#Preview("Photo — placeholder") {
    ColorSchemePreview {
        PopsPhoto(data: nil, placeholderSymbol: "doc.text.viewfinder")
            .frame(width: PopsSize.pageWidth, height: PopsSize.pageHeight)
            .padding(PopsSpacing.lg)
    }
}
