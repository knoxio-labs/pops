import SwiftUI

#if canImport(UIKit)
    import UIKit
#elseif canImport(AppKit)
    import AppKit
#endif

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
/// ## The decode is synchronous, and that is a bounded claim
///
/// `body` decodes on every evaluation. That is affordable here and only here:
/// the app's photographs are receipt pages, which `ReceiptPageBudget` caps in
/// both edge length and JPEG quality before they are ever held, and a screen
/// shows a handful of them. A future surface drawing a scrolling list of these
/// wants a decoded, cached image handed in instead — that is a different
/// initialiser, not a bigger `body`.
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

    private nonisolated static func decode(_ data: Data?) -> Image? {
        guard let data, !data.isEmpty else { return nil }
        #if canImport(UIKit)
            return UIImage(data: data).map(Image.init(uiImage:))
        #elseif canImport(AppKit)
            return NSImage(data: data).map(Image.init(nsImage:))
        #else
            return nil
        #endif
    }
}

#Preview("Photo — placeholder") {
    ColorSchemePreview {
        PopsPhoto(data: nil, placeholderSymbol: "doc.text.viewfinder")
            .frame(width: PopsSize.pageWidth, height: PopsSize.pageHeight)
            .padding(PopsSpacing.lg)
    }
}
