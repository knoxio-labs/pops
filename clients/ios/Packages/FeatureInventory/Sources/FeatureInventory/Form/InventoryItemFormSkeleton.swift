import DesignSystem
import SwiftUI

/// The form before the store has answered once: the same blocks the photo
/// strip and the two sections draw, empty, so the layout does not jump when
/// the draft (a fresh one, or an item being edited) arrives.
internal struct InventoryItemFormSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var thumbSide = PopsSize.countField
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            strip
            VStack(spacing: PopsSpacing.md) {
                ForEach(0..<4, id: \.self) { _ in
                    block(height: rowHeight)
                }
            }
            VStack(spacing: PopsSpacing.md) {
                ForEach(0..<3, id: \.self) { _ in
                    block(height: rowHeight)
                }
            }
        }
        .popsShimmer()
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.top, PopsSpacing.md)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.popsBackground)
        .accessibilityLabel("Loading")
    }

    private var strip: some View {
        HStack(spacing: PopsSpacing.sm) {
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                    .fill(Color.popsSurface)
                    .frame(width: thumbSide, height: thumbSide)
            }
        }
    }

    private func block(height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
            .fill(Color.popsSurface)
            .frame(height: height)
    }
}
