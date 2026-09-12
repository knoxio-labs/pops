import AppCore
import DesignSystem
import SwiftUI

/// One staged page, pinchable and pannable.
///
/// A till receipt is printed at about six point and photographed from a
/// distance that fits all of it in frame, so "is this readable" cannot be
/// answered at the size the page arrives at. Zoom is not a nicety on this
/// screen; it is the only way to check the thing the screen exists to check.
///
/// ## Why panning is conditional
///
/// The viewer pages between photographs with a horizontal swipe, and a pan is
/// also a drag. The two cannot both own the gesture, so the rule is the one
/// Photos uses: at rest a drag belongs to the pager, and once the page is
/// zoomed it belongs to the picture. That is why the pan gesture is attached
/// only while `scale > 1` rather than always attached and ignoring events —
/// an attached gesture still competes for the drag even when it does nothing
/// with it.
///
/// Zoom resets when the page leaves the screen. A photograph you return to
/// holding the magnification you left on a different one is a photograph you
/// have to unzoom before you can tell which it is.
internal struct ZoomablePage: View {
    internal let page: StagedPage

    @State private var scale: CGFloat = 1
    @State private var committed: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var committedOffset: CGSize = .zero

    private let maximum: CGFloat = 6
    private let doubleTapScale: CGFloat = 2.5

    internal var body: some View {
        picture
            .scaleEffect(scale)
            .offset(offset)
            .animation(.snappy(duration: 0.2), value: scale)
            .onTapGesture(count: 2) { toggleZoom() }
            .onDisappear { reset() }
            .accessibilityLabel(page.label)
    }

    @ViewBuilder private var picture: some View {
        let plate = PopsPhoto(data: page.bytes, placeholderSymbol: glyph)
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
                scale = min(max(committed * value.magnification, 1), maximum)
            }
            .onEnded { _ in
                committed = scale
                if scale == 1 { recentre() }
            }
    }

    private var pan: some Gesture {
        DragGesture()
            .onChanged { value in
                offset = CGSize(
                    width: committedOffset.width + value.translation.width,
                    height: committedOffset.height + value.translation.height
                )
            }
            .onEnded { _ in committedOffset = offset }
    }

    /// Double tap zooms in, and double tap again comes all the way back —
    /// rather than stepping through magnifications, which leaves a person
    /// tapping to find the one that was the original.
    private func toggleZoom() {
        if scale > 1 {
            reset()
        } else {
            scale = doubleTapScale
            committed = doubleTapScale
        }
    }

    private func recentre() {
        offset = .zero
        committedOffset = .zero
    }

    private func reset() {
        scale = 1
        committed = 1
        recentre()
    }

    private var glyph: String {
        switch page.media {
        case .jpeg, .png, .webp, .gif: "doc.text.image"
        case .pdf: "doc.richtext"
        case .plainText: "doc.plaintext"
        }
    }
}
