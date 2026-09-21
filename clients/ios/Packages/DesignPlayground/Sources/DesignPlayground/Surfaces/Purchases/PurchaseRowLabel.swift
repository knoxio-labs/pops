import AppCore
import DesignSystem
import SwiftUI

/// A purchase in Inventory's row idiom: the merchant's mark, its name over a
/// caption, the amount, and a chevron when the row opens something.
///
/// The home and the archive draw the same row, so a purchase looks the same
/// wherever it is found.
internal struct PurchaseRowLabel: View {
    internal let mark: Purchase
    internal let title: String
    internal let detail: String
    internal let amount: MoneyAmount
    internal var badge: PurchaseSettlement?
    internal var muted = false
    internal var opens = true
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget - PopsSpacing.xs

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            PurchaseMark(purchase: mark, size: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title)
                    .font(.popsHeadline)
                    .foregroundStyle(muted ? Color.popsMutedForeground : Color.popsForeground)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: PopsSpacing.sm) {
                    Text(detail)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .lineLimit(1)
                    if let badge {
                        PurchaseStatusBadge(status: badge)
                    }
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(amount.formatted())
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .layoutPriority(1)
                .contentTransition(.numericText(value: Double(amount.minorUnits)))
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

extension PurchaseRowLabel {
    /// One purchase: its merchant, the day, and its status where the caller
    /// says the status is worth a badge.
    internal init(purchase: Purchase, badge: Bool = false) {
        self.init(
            mark: purchase,
            title: PurchasesPresentation.merchant(purchase),
            detail: PurchasesPresentation.day(purchase),
            amount: purchase.total,
            badge: badge ? purchase.status : nil,
            muted: PurchasesPresentation.isUnattributed(purchase))
    }
}

/// Rows in the dashboard's panel, divided past the mark the way Inventory's
/// lists are.
internal struct PurchaseRowsPanel<Row: Identifiable, Content: View>: View {
    internal let rows: [Row]
    @ViewBuilder internal let content: (Row) -> Content
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget - PopsSpacing.xs

    internal var body: some View {
        InventoryGroundedListPanel {
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                ForEach(rows) { row in
                    content(row)
                        .transition(InventoryMotion.row)
                    if row.id != rows.last?.id {
                        PopsDivider()
                            .padding(.leading, markSize + PopsSpacing.md)
                    }
                }
            }
        }
    }
}
