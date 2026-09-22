import AppCore
import DesignSystem
import FeaturePurchases
import SwiftUI

/// Who the purchase was from and what it came to, with the receipt beside it.
///
/// The merchant leads with the same mark the home's rows use, so a purchase
/// opened from a row keeps its identity. The total is the one figure; the
/// till's wording and the day sit under the name as quiet text. The paper is
/// imagery at the trailing edge, and a purchase without one simply has none.
internal struct PurchaseDetailHeader: View {
    internal let detail: PurchaseDetail
    internal let open: (StagedPage) -> Void
    @ScaledMetric(relativeTo: .title) private var markSize = PopsSize.touchTarget + PopsSpacing.sm
    @ScaledMetric(relativeTo: .title) private var plateWidth = PopsSize.pageWidth * 0.55

    private var purchase: Purchase { detail.purchase }

    internal var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.lg) {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                identity
                HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                    Text(purchase.total.formatted())
                        .font(.popsAmount)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsForeground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .contentTransition(.numericText(value: Double(purchase.total.minorUnits)))
                    if let code = PurchaseDetailCopy.foreignCurrency(purchase.total) {
                        Text(code)
                            .font(.popsHeadline)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            paper
        }
    }

    private var identity: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            PurchaseMark(purchase: purchase, size: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchasesPresentation.merchant(purchase))
                    .font(.popsTitle)
                    .foregroundStyle(
                        PurchasesPresentation.isUnattributed(purchase)
                            ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                if let printed = PurchaseDetailCopy.printed(purchase.merchant) {
                    Text(printed)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(PurchaseDetailCopy.day(purchase.orderedOn))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var paper: some View {
        if let first = detail.pages.first {
            Button {
                open(first)
            } label: {
                PopsPhoto(data: first.bytes, placeholderSymbol: first.symbolName)
                    .frame(
                        width: plateWidth,
                        height: plateWidth * PopsSize.pageHeight / PopsSize.pageWidth
                    )
                    .overlay(alignment: .bottomTrailing) {
                        if detail.pages.count > 1 { pageCount }
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(PurchaseDetailCopy.receiptLabel(pages: detail.pages.count))
            .accessibilityHint("Opens the receipt")
        }
    }

    private var pageCount: some View {
        Text("\(detail.pages.count)")
            .font(.popsCaption.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(Color.popsForeground)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .playgroundGlass(in: Capsule())
            .padding(PopsSpacing.xs)
    }
}
