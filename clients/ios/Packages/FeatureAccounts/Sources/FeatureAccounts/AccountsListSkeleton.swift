import DesignSystem
import SwiftUI

internal struct AccountsListSkeleton: View {
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                heading
                searchField
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    SkeletonShape(width: PopsSize.countField)
                    AccountGridSkeleton(rows: 6, accessibilityLabel: AccountsCopy.loading)
                }
            }
            .padding(PopsSpacing.lg)
        }
        .scrollBounceBehavior(.always, axes: .vertical)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(AccountsCopy.loading)
        .accessibilityIdentifier(AccountsAccessibility.list)
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            SkeletonShape(width: PopsSize.amountColumn)
            SkeletonShape(width: PopsSize.countField)
        }
        .popsShimmer()
        .accessibilityHidden(true)
    }

    private var searchField: some View {
        HStack(spacing: PopsSpacing.md) {
            Circle()
                .fill(Color.popsMutedForeground.opacity(0.14))
                .frame(width: PopsSpacing.lg, height: PopsSpacing.lg)
            SkeletonShape(width: PopsSize.amountColumn)
            Spacer(minLength: PopsSpacing.zero)
        }
        .padding(.horizontal, PopsSpacing.lg)
        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget, alignment: .leading)
        .popsShimmer()
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.control))
        .accessibilityHidden(true)
    }
}

internal struct AccountGridSkeleton: View {
    private let rows: Int
    private let accessibilityLabel: String

    internal init(rows: Int, accessibilityLabel: String) {
        self.rows = max(rows, 0)
        self.accessibilityLabel = accessibilityLabel
    }

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible())],
            spacing: PopsSpacing.md
        ) {
            ForEach(0..<rows, id: \.self) { _ in
                AccountCardSkeleton()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct AccountCardSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var markDimension = AccountMarkSize.small.baseDimension

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsMutedForeground.opacity(0.14))
                .frame(width: markDimension, height: markDimension)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                SkeletonShape(width: PopsSize.amountColumn)
                SkeletonShape(width: PopsSize.countField)
            }
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                SkeletonShape(width: PopsSize.amountColumn)
                SkeletonShape(width: PopsSize.countField)
            }
        }
        .popsShimmer()
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .accessibilityHidden(true)
    }
}

private struct SkeletonShape: View {
    let width: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
            .fill(Color.popsMutedForeground.opacity(0.14))
            .frame(width: width, height: PopsSpacing.md)
    }
}
