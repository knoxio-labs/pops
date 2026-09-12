import AppCore
import DesignSystem
import SwiftUI

/// One staged page in the grid: the picture, what it is called, and every
/// gesture that can start or end on it.
///
/// Its own view rather than a method on the grid because it is where all three
/// gestures meet — a tap that opens it, a drag that lifts it, and a drop that
/// makes it the other half of a receipt — and a grid that also held the
/// rearrangement and the layout was over the length a reader can hold.
internal struct StagedPageTile: View {
    internal let page: StagedPage
    internal let width: CGFloat
    internal let caption: String
    internal let isTarget: Bool
    internal let onTap: () -> Void
    internal let drop: PageDropDelegate

    private let ratio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth
    /// The target settles *into* the well rather than swelling out of it.
    private let targetScale: CGFloat = 0.88
    private let liftScale: CGFloat = 1.08

    internal var body: some View {
        VStack(spacing: PopsSpacing.xs) {
            picture
            Text(caption)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(width: width)
        }
        .contentShape(.rect)
        .onTapGesture(perform: onTap)
        .draggable(page.id) { lifted }
        .onDrop(of: [.plainText], delegate: drop)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caption)
        .accessibilityAddTraits(.isButton)
    }

    private var picture: some View {
        PopsPhoto(data: page.bytes, placeholderSymbol: page.symbolName)
            .frame(width: width, height: width * ratio)
            .scaleEffect(isTarget ? targetScale : 1)
            .background { StagedDropWell(active: isTarget) }
            .animation(.snappy(duration: 0.18), value: isTarget)
    }

    /// What rides under the finger. Opaque, because the system composites a
    /// translucent preview over its own platter and cream paper under that
    /// came out a grey slab; and scaled up a little, because the home screen
    /// lifts what you are holding rather than dimming it.
    private var lifted: some View {
        PopsPhoto(data: page.bytes, placeholderSymbol: page.symbolName)
            .frame(width: width * liftScale, height: width * ratio * liftScale)
            .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
    }
}

/// The soft container the home screen grows behind the icon you are hovering
/// over — larger than the thing itself, its own corner radius, no border.
///
/// A ring reads as a selection. A well reads as somewhere the item is about to
/// go into, which is what is about to happen.
internal struct StagedDropWell: View {
    internal let active: Bool

    internal var body: some View {
        RoundedRectangle(cornerRadius: PopsRadius.card)
            .fill(Color.popsAccent.opacity(active ? 0.3 : 0))
            .padding(-PopsSpacing.sm)
    }
}
