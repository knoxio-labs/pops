import DesignSystem
import SwiftUI

internal struct TransactionsListSkeleton: View {
    private static let rows = 8

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
                ForEach(0..<Self.rows, id: \.self) { index in
                    if index > 0 { PopsDivider() }
                    TransactionRowSkeleton()
                }
            }
            .padding(PopsSpacing.lg)
        }
        .scrollBounceBehavior(.always, axes: .vertical)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(TransactionsCopy.loading)
        .accessibilityIdentifier(TransactionsAccessibility.list)
    }
}

internal struct TransactionPageSkeleton: View {
    var body: some View {
        LazyVStack(alignment: .leading, spacing: PopsSpacing.zero) {
            ForEach(0..<2, id: \.self) { index in
                if index > 0 { PopsDivider() }
                TransactionRowSkeleton()
            }
        }
        .padding(.vertical, PopsSpacing.lg)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(TransactionsCopy.loadingMore)
    }
}

internal struct TransactionRowSkeleton: View {
    internal let accessibilityLabel: String?

    @ScaledMetric(relativeTo: .body) private var lineHeight = PopsSpacing.md

    internal init(accessibilityLabel: String? = nil) {
        self.accessibilityLabel = accessibilityLabel
    }

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            HStack(alignment: .center, spacing: PopsSpacing.md) {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    TransactionSkeletonLine(fraction: 0.72)
                    TransactionSkeletonLine(fraction: 0.48)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                TransactionSkeletonLine(fraction: 0.68)
                    .frame(width: PopsSize.amountColumn)
            }
            TransactionSkeletonLine(fraction: 0.38)
        }
        .padding(.vertical, PopsSpacing.sm)
        .popsShimmer()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel ?? "")
        .accessibilityHidden(accessibilityLabel == nil)
    }
}

private struct TransactionSkeletonLine: View {
    let fraction: CGFloat

    @ScaledMetric(relativeTo: .body) private var lineHeight = PopsSpacing.md

    var body: some View {
        GeometryReader { geometry in
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsMutedForeground.opacity(0.14))
                .frame(
                    width: max(geometry.size.width * fraction, PopsSpacing.lg),
                    height: lineHeight
                )
        }
        .frame(height: lineHeight)
    }
}
