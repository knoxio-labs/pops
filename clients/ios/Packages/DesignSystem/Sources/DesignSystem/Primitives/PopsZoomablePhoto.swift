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

    @State private var scale: CGFloat = 1
    @State private var committedScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var committedOffset: CGSize = .zero
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let maximumScale: CGFloat = 6
    private let doubleTapScale: CGFloat = 2.5

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
        picture
            .scaleEffect(scale)
            .offset(offset)
            .animation(
                PopsMotion.animation(PopsMotion.snappy, reduceMotion: reduceMotion),
                value: scale
            )
            .onTapGesture(count: 2) { toggleZoom() }
    }

    @ViewBuilder private var picture: some View {
        let plate = PopsPhoto(
            data: data, placeholderSymbol: placeholderSymbol, contentMode: contentMode
        )
        .padding(PopsSpacing.xl)
        if scale > 1 {
            plate.gesture(pan.simultaneously(with: magnify))
        } else {
            plate.gesture(magnify)
        }
    }

    private var magnify: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = min(max(committedScale * value.magnification, 1), maximumScale)
            }
            .onEnded { _ in
                committedScale = scale
                if scale == 1 { recentre() }
            }
    }

    private var pan: some Gesture {
        DragGesture()
            .onChanged { value in
                offset = PopsZoomablePhotoPresentation.offset(
                    committedOffset: committedOffset,
                    translation: value.translation,
                    scale: scale
                )
            }
            .onEnded { _ in committedOffset = offset }
    }

    private func toggleZoom() {
        if scale > 1 {
            scale = 1
            committedScale = 1
            recentre()
        } else {
            scale = doubleTapScale
            committedScale = doubleTapScale
        }
    }

    private func recentre() {
        offset = .zero
        committedOffset = .zero
    }
}

internal enum PopsZoomablePhotoPresentation {
    internal static func offset(
        committedOffset: CGSize, translation: CGSize, scale: CGFloat
    ) -> CGSize {
        let effectiveScale = max(scale, 1)
        return CGSize(
            width: committedOffset.width + translation.width * effectiveScale,
            height: committedOffset.height + translation.height * effectiveScale
        )
    }
}
