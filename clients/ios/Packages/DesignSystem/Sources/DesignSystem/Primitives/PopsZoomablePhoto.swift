import Foundation
import SwiftUI

/// A photo plate that supports pinch zoom, panning while zoomed, and double-tap reset.
///
/// Receipt capture and purchase detail both need to inspect photographed pages, but neither
/// feature may import the other. Keeping the interaction around ``PopsPhoto`` here gives both
/// features the same receipt-agnostic primitive.
public struct PopsZoomablePhoto: View {
    private let data: Data?
    private let placeholderSymbol: String
    private let contentMode: ContentMode

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Creates an interactive photo plate.
    ///
    /// - Parameters:
    ///   - data: Encoded image bytes. `nil` or undecodable bytes draw the placeholder.
    ///   - placeholderSymbol: The SF Symbol drawn when `data` has no decodable image.
    ///   - contentMode: How the decoded image fills its plate. `.fill` is the
    ///     existing default; `.fit` keeps the complete photograph visible.
    public init(
        data: Data?, placeholderSymbol: String, contentMode: ContentMode = .fill
    ) {
        self.data = data
        self.placeholderSymbol = placeholderSymbol
        self.contentMode = contentMode
    }

    public var body: some View {
        PopsZoomablePhotoPlatform(
            data: data,
            placeholderSymbol: placeholderSymbol,
            contentMode: contentMode,
            reduceMotion: reduceMotion
        )
    }
}

internal enum PopsZoomablePhotoPresentation {
    static let minimumScale: CGFloat = 1
    static let maximumScale: CGFloat = 6
    static let doubleTapScale: CGFloat = 2.5

    static func scaleAfterDoubleTap(currentScale: CGFloat) -> CGFloat {
        currentScale > minimumScale ? minimumScale : doubleTapScale
    }
}
