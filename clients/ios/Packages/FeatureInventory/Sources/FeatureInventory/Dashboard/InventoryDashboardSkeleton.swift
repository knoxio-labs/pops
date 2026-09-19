import DesignSystem
import SwiftUI

/// The dashboard before the store has answered once: blank shapes where the
/// Browse tiles and a list panel will be, so the screen does not jump when
/// they arrive. Built from the approved browsers' own skeleton blocks; the
/// approved dashboard states draw no loading state of their own.
internal struct InventoryDashboardSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var tileHeight = PopsSize.touchTarget * 1.6
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                VStack(spacing: PopsSpacing.sm) {
                    block(height: tileHeight, radius: PopsRadius.card)
                    HStack(spacing: PopsSpacing.sm) {
                        block(height: tileHeight, radius: PopsRadius.card)
                        block(height: tileHeight, radius: PopsRadius.card)
                    }
                }
                VStack(spacing: PopsSpacing.md) {
                    ForEach(0..<3, id: \.self) { _ in
                        block(height: rowHeight, radius: PopsRadius.control)
                    }
                }
            }
            .popsShimmer()
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .accessibilityLabel("Loading")
    }

    private func block(height: CGFloat, radius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Color.popsSurface)
            .frame(height: height)
    }
}
