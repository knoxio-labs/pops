import AppCore
import DesignSystem
import SwiftUI

/// What the total is made of, in the order a receipt prints it.
///
/// Empty when the items are the whole of the total: the header already shows
/// that figure, and a foot restating it adds a row and says nothing.
internal enum PurchaseDetailTotals {
    internal struct Row: Hashable {
        internal let label: String
        internal let amount: String
        internal var isTotal = false
    }

    internal static func rows(for detail: PurchaseDetail) -> [Row] {
        let adjustments: [Row] = [
            shown("Tax", detail.tax),
            shown("Delivery", detail.shipping),
            shown("Surcharge", detail.surcharge),
            shown("Discount", detail.discount).map {
                Row(label: $0.label, amount: "−\($0.amount)")
            },
        ].compactMap { $0 }
        guard !adjustments.isEmpty else { return [] }
        return [Row(label: "Subtotal", amount: detail.subtotal.formatted())] + adjustments
            + [Row(label: "Total", amount: detail.purchase.total.formatted(), isTotal: true)]
    }

    private static func shown(_ label: String, _ amount: MoneyAmount) -> Row? {
        amount.minorUnits == 0 ? nil : Row(label: label, amount: amount.formatted())
    }
}

/// The purchase's lines as a receipt: Inventory's solid panel, one row per
/// line, and the totals at its foot.
///
/// The lines scroll inside the panel once there are more than the screen
/// holds; the foot stays put under them, as the bottom of a receipt does.
internal struct PurchaseDetailReceipt: View {
    internal let detail: PurchaseDetail

    internal var body: some View {
        let totals = PurchaseDetailTotals.rows(for: detail)
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryLocationSectionHeader(
                title: "Items",
                trailing: detail.lines.isEmpty ? nil : "\(detail.lines.count)")
            if detail.lines.isEmpty && totals.isEmpty {
                InventoryLocationEmptyLine(text: "Not itemised")
            } else {
                InventoryGroundedListPanel {
                    VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                        if detail.lines.isEmpty {
                            PurchaseDetailEmptyLines()
                        } else {
                            ViewThatFits(in: .vertical) {
                                lines
                                ScrollView { lines }
                                    .scrollBounceBehavior(.basedOnSize)
                                    .scrollIndicators(.hidden)
                            }
                        }
                        if !totals.isEmpty {
                            PopsDivider()
                            PurchaseDetailTotalsFoot(rows: totals)
                        }
                    }
                }
            }
        }
    }

    private var lines: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            ForEach(detail.lines) { line in
                PurchaseDetailLineRow(line: line)
                    .transition(InventoryMotion.row)
                if line.id != detail.lines.last?.id {
                    PopsDivider()
                }
            }
        }
    }
}

private struct PurchaseDetailEmptyLines: View {
    var body: some View {
        Text("Not itemised")
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget, alignment: .leading)
    }
}

/// One line: its name, wrapping rather than cut, the quantity folded in
/// under it, and the amount in a right-aligned column of even digits.
internal struct PurchaseDetailLineRow: View {
    internal let line: PurchaseDetailLine

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchaseDetailLineText.oneLine(line.name))
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                if let quantity = PurchaseDetailLineText.quantity(line) {
                    Text(quantity)
                        .font(.popsCaption)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(line.lineTotal.formatted())
                .font(.popsBody)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.sm)
        .frame(minHeight: PopsSize.touchTarget)
        .accessibilityElement(children: .combine)
    }
}

/// Subtotal, each adjustment, and the total, under the lines.
private struct PurchaseDetailTotalsFoot: View {
    let rows: [PurchaseDetailTotals.Row]

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            ForEach(rows, id: \.label) { row in
                HStack(alignment: .firstTextBaseline) {
                    Text(row.label)
                        .foregroundStyle(
                            row.isTotal ? Color.popsForeground : Color.popsMutedForeground)
                    Spacer(minLength: PopsSpacing.sm)
                    Text(row.amount)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsForeground)
                }
                .font(row.isTotal ? .popsHeadline : .popsSubheadline)
                .padding(.top, row.isTotal ? PopsSpacing.xs : PopsSpacing.zero)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.vertical, PopsSpacing.md)
    }
}

/// How a till's line reads on a phone.
internal enum PurchaseDetailLineText {
    /// A till line with its newlines turned into separators. The paper writes
    /// one line over three, and three rows of height per item is a list
    /// nobody scrolls.
    internal static func oneLine(_ name: String) -> String {
        name.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: " · ")
    }

    /// `2 × $14.25` under a line bought more than once. The unit price is
    /// only stated when the line total divides evenly by the quantity; a
    /// rounded one would be a price nobody paid.
    internal static func quantity(_ line: PurchaseDetailLine) -> String? {
        guard line.quantity > 1 else { return nil }
        let total = line.lineTotal.minorUnits
        guard total % line.quantity == 0 else { return "Qty \(line.quantity)" }
        let unit = MoneyAmount(
            minorUnits: total / line.quantity, currencyCode: line.lineTotal.currencyCode)
        return "\(line.quantity) × \(unit.formatted())"
    }
}
