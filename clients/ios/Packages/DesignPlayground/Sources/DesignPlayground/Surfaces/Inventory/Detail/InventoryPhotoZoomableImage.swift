import SwiftUI

internal struct InventoryPhotoZoomableImage: View {
    internal let image: Image
    internal let caption: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scale: CGFloat = 1
    @State private var committedScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var committedOffset: CGSize = .zero

    private let minimumScale: CGFloat = 1
    private let doubleTapScale: CGFloat = 2.5
    private let maximumScale: CGFloat = 4

    internal var body: some View {
        GeometryReader { proxy in
            interactiveImage(in: proxy.size)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caption)
        .accessibilityHint("Double-tap to zoom. Drag to inspect while zoomed.")
    }

    @ViewBuilder private func interactiveImage(in size: CGSize) -> some View {
        if scale > minimumScale {
            content
                .gesture(pan(in: size).simultaneously(with: magnify(in: size)))
                .onTapGesture(count: 2) { toggleZoom(in: size) }
        } else {
            content
                .gesture(magnify(in: size))
                .onTapGesture(count: 2) { toggleZoom(in: size) }
        }
    }

    private var content: some View {
        image
            .resizable()
            .scaledToFit()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .scaleEffect(scale)
            .offset(offset)
            .animation(reduceMotion ? nil : .snappy(duration: 0.2), value: scale)
            .animation(reduceMotion ? nil : .snappy(duration: 0.2), value: offset)
            .contentShape(.rect)
    }

    private func magnify(in size: CGSize) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = min(
                    max(committedScale * value.magnification, minimumScale), maximumScale)
                offset = constrained(offset, scale: scale, in: size)
            }
            .onEnded { _ in
                committedScale = scale
                committedOffset = constrained(offset, scale: scale, in: size)
                offset = committedOffset
            }
    }

    private func pan(in size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                offset = constrained(
                    CGSize(
                        width: committedOffset.width + value.translation.width,
                        height: committedOffset.height + value.translation.height
                    ),
                    scale: scale,
                    in: size
                )
            }
            .onEnded { _ in
                committedOffset = offset
            }
    }

    private func toggleZoom(in size: CGSize) {
        if scale > minimumScale {
            scale = minimumScale
            committedScale = minimumScale
            offset = .zero
            committedOffset = .zero
        } else {
            scale = doubleTapScale
            committedScale = doubleTapScale
            offset = constrained(offset, scale: doubleTapScale, in: size)
            committedOffset = offset
        }
    }

    private func constrained(_ value: CGSize, scale: CGFloat, in size: CGSize) -> CGSize {
        let horizontalLimit = max(0, size.width * (scale - minimumScale) / 2)
        let verticalLimit = max(0, size.height * (scale - minimumScale) / 2)
        return CGSize(
            width: min(max(value.width, -horizontalLimit), horizontalLimit),
            height: min(max(value.height, -verticalLimit), verticalLimit)
        )
    }
}
