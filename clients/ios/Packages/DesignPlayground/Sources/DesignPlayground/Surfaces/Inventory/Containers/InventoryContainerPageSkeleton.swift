import DesignSystem
import SwiftUI

/// The container page before its record arrives: the item page's blocks,
/// then skeleton rows where the contents go.
internal struct InventoryContainerPageSkeleton: View {
    @ScaledMetric(relativeTo: .largeTitle) private var heroHeight = PopsSize.pageHeight * 1.5
    @ScaledMetric(relativeTo: .body) private var line = PopsSpacing.lg
    @ScaledMetric(relativeTo: .body) private var control = PopsSize.touchTarget

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            blocks
                .popsShimmer()
            Spacer(minLength: PopsSpacing.zero)
        }
        .background(Color.popsBackground)
        .ignoresSafeArea(edges: .top)
        .navigationTitle("")
        .playgroundTitleDisplay(large: false)
        .accessibilityLabel("Loading")
    }

    private var blocks: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Color.popsSurface
                .frame(height: heroHeight)
                .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                bar(width: 0.7, height: line)
                bar(width: 0.4, height: line)
                bar(width: 0.55, height: line)
            }
            .padding(.horizontal, PopsSpacing.lg)
            HStack(spacing: PopsSpacing.lg) {
                ForEach(0..<4, id: \.self) { _ in
                    Circle().fill(Color.popsSurface)
                        .frame(width: control, height: control)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.sm)
            VStack(spacing: PopsSpacing.sm) {
                ForEach(0..<4, id: \.self) { _ in bar(width: 1, height: control) }
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
    }

    private func bar(width: CGFloat, height: CGFloat) -> some View {
        GeometryReader { proxy in
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsSurface)
                .frame(width: proxy.size.width * width)
        }
        .frame(height: height)
    }
}
