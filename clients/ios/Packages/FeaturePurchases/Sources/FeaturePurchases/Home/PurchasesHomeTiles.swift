import DesignSystem
import SwiftUI

internal enum PurchasesHomeTileLayout {
    internal static func stacks(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }

    internal static func showsUnmatched(count: Int) -> Bool {
        count > 0
    }
}

internal struct PurchasesHomeTiles: View {
    internal let digest: PurchasesHomeDigest
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    internal var body: some View {
        let layout =
            PurchasesHomeTileLayout.stacks(at: dynamicTypeSize)
            ? AnyLayout(VStackLayout(spacing: PopsSpacing.sm))
            : AnyLayout(HStackLayout(spacing: PopsSpacing.sm))
        layout {
            if PurchasesHomeTileLayout.showsUnmatched(count: digest.unmatchedCount) {
                NavigationLink(value: PurchasesScreenRoute.archive(.unmatched)) {
                    ViewThatFits(in: .horizontal) {
                        unmatchedTile(marks: 3)
                        unmatchedTile(marks: 2)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(PurchasesAccessibility.unmatchedTile)
            }
            NavigationLink(value: PurchasesScreenRoute.archive(.all)) {
                PurchasesHomeTile(count: digest.allCount, title: "All purchases") {
                    PurchasesTileSymbol(symbol: "tray.full")
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(PurchasesAccessibility.allTile)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func unmatchedTile(marks: Int) -> some View {
        PurchasesHomeTile(count: digest.unmatchedCount, title: "Unmatched") {
            PurchaseMarkStack(purchases: Array(digest.unmatched.prefix(marks)))
        }
    }
}

internal struct PurchasesHomeTile<Mark: View>: View {
    internal let count: Int
    internal let title: String
    @ViewBuilder internal let mark: () -> Mark

    internal var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            mark()
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(count)")
                    .font(.popsHeadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                    .contentTransition(.numericText(value: Double(count)))
                Text(title)
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: PopsSpacing.zero)
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .popsGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

internal struct PurchasesTileSymbol: View {
    internal let symbol: String
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    internal var body: some View {
        Image(systemName: symbol)
            .font(.popsHeadline)
            .foregroundStyle(Color.popsPurchases)
            .frame(width: size, height: size)
            .background(Color.popsPurchases.opacity(0.14), in: .circle)
            .accessibilityHidden(true)
    }
}
