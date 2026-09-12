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
/// It used to be because the viewer paged on a horizontal swipe and the two
/// drags fought. That pager is gone — three gestures competing for one finger
/// was the bug — so the remaining reason is smaller and still holds: a drag on
/// an unzoomed page would slide a picture that already fits entirely on
/// screen off the side of it, which is movement with nothing to reveal.
///
/// This view owns no reset. The viewer gives each page its own identity, so
/// moving to the next photograph builds a new one at rest rather than handing
/// this one a different picture to still be magnified over.
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
            .accessibilityLabel(page.label)
    }

    @ViewBuilder private var picture: some View {
        let plate = PopsPhoto(data: page.bytes, placeholderSymbol: page.symbolName)
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
}
