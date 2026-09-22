import AppCore
import DesignSystem
import SwiftUI

@MainActor
internal struct PurchaseRowContent: Equatable {
    internal let mark: Purchase
    internal let title: String
    internal let detail: String
    internal let amount: MoneyAmount
    internal let badge: PurchaseSettlement?
    internal let muted: Bool

    internal init(purchase: Purchase, badge: Bool = false) {
        self.init(
            mark: purchase,
            title: PurchasesPresentation.merchant(purchase),
            detail: PurchasesPresentation.day(purchase),
            amount: purchase.total,
            badge: badge ? purchase.status : nil,
            muted: PurchasesPresentation.isUnattributed(purchase))
    }

    internal init(mark: Purchase, title: String, detail: String, amount: MoneyAmount) {
        self.init(
            mark: mark,
            title: title,
            detail: detail,
            amount: amount,
            badge: nil,
            muted: false)
    }

    private init(
        mark: Purchase,
        title: String,
        detail: String,
        amount: MoneyAmount,
        badge: PurchaseSettlement?,
        muted: Bool
    ) {
        self.mark = mark
        self.title = title
        self.detail = detail
        self.amount = amount
        self.badge = badge
        self.muted = muted
    }
}

internal struct PurchaseRowLabel: View {
    internal let content: PurchaseRowContent
    internal var opens = true
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget - PopsSpacing.xs

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            PurchaseMark(purchase: content.mark, size: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(content.title)
                    .font(.popsHeadline)
                    .foregroundStyle(
                        content.muted ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: PopsSpacing.sm) {
                    Text(content.detail)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .lineLimit(1)
                    if let badge = content.badge {
                        PurchaseStatusBadge(status: badge)
                    }
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(content.amount.formatted())
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .layoutPriority(1)
                .contentTransition(.numericText(value: Double(content.amount.minorUnits)))
            if opens {
                Image(systemName: "chevron.forward")
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

internal struct PurchaseRowsPanel<Row: Identifiable, Content: View>: View {
    internal let rows: [Row]
    @ViewBuilder internal let content: (Row) -> Content
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget - PopsSpacing.xs

    internal var body: some View {
        PopsListPanel {
            PopsDividedRows(
                rows: rows,
                leadingInset: markSize + PopsSpacing.md,
                content: content)
        }
    }
}

internal struct PurchaseMarkStack: View {
    internal let purchases: [Purchase]
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget - PopsSpacing.md

    internal var body: some View {
        HStack(spacing: -size / 3) {
            ForEach(Array(purchases.enumerated()), id: \.element.id) { index, purchase in
                PurchaseMark(purchase: purchase, size: size)
                    .overlay {
                        RoundedRectangle(cornerRadius: PopsRadius.control)
                            .strokeBorder(Color.popsBackground, lineWidth: PopsBorder.emphasis)
                    }
                    .zIndex(Double(-index))
            }
        }
        .accessibilityHidden(true)
    }
}
