import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseDetailHeader: View {
    internal let detail: PurchaseDetail
    internal let receiptPages: [PurchaseReceiptThumbnail]
    internal let open: (Int) -> Void
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
        if let first = receiptPages.first {
            Button {
                open(first.pageIndex)
            } label: {
                PopsPhoto(data: first.image.data, placeholderSymbol: "doc.text.viewfinder")
                    .frame(
                        width: plateWidth,
                        height: plateWidth * PopsSize.pageHeight / PopsSize.pageWidth
                    )
                    .overlay(alignment: .bottomTrailing) {
                        if detail.receiptURIs.count > 1 { pageCount }
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                PurchaseDetailCopy.receiptLabel(pages: detail.receiptURIs.count)
            )
            .accessibilityHint("Opens the receipt")
            .accessibilityIdentifier(PurchaseDetailAccessibility.receiptPlate)
        }
    }

    private var pageCount: some View {
        Text("\(detail.receiptURIs.count)")
            .font(.popsCaption.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(Color.popsForeground)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .popsGlass(in: Capsule())
            .padding(PopsSpacing.xs)
    }
}
