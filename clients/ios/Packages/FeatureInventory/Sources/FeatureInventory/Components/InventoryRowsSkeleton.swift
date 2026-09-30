import DesignSystem
import SwiftUI

internal struct InventoryRowsSkeleton: View {
    internal let rows: Int
    internal var showsTrailingValue = true

    internal init(rows: Int, showsTrailingValue: Bool = true) {
        self.rows = max(rows, 0)
        self.showsTrailingValue = showsTrailingValue
    }

    internal var body: some View {
        LazyVStack(spacing: PopsSpacing.zero) {
            ForEach(0..<rows, id: \.self) { index in
                InventoryRowSkeleton(
                    lineLengths: index.isMultiple(of: 2) ? [0.72, 0.43] : [0.56, 0.34],
                    showsTrailingValue: showsTrailingValue)
                if index < rows - 1 {
                    PopsDivider()
                        .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                }
            }
        }
        .popsShimmer()
        .accessibilityLabel("Loading")
    }
}

private struct InventoryRowSkeleton: View {
    let lineLengths: [CGFloat]
    let showsTrailingValue: Bool
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget
    @ScaledMetric(relativeTo: .caption) private var lineHeight = PopsSpacing.sm

    var body: some View {
        HStack(spacing: PopsSpacing.md) {
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsSeparator)
                .frame(width: markSize, height: markSize)
            GeometryReader { geometry in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    ForEach(Array(lineLengths.enumerated()), id: \.offset) { _, length in
                        Capsule()
                            .fill(Color.popsSeparator)
                            .frame(width: geometry.size.width * length, height: lineHeight)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(maxWidth: .infinity)
            if showsTrailingValue {
                Capsule()
                    .fill(Color.popsSeparator)
                    .frame(width: markSize * 0.55, height: lineHeight)
            }
        }
        .frame(minHeight: markSize)
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityHidden(true)
    }
}
