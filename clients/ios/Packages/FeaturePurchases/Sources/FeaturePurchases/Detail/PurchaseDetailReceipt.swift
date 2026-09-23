import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseDetailReceipt: View {
    internal let detail: PurchaseDetail

    internal var body: some View {
        let totals = PurchaseDetailTotals.rows(for: detail)
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsSectionHeader(
                title: "Items", trailing: detail.lines.isEmpty ? nil : "\(detail.lines.count)")
            if detail.lines.isEmpty && totals.isEmpty {
                PopsEmptyLine(text: "Not itemised")
            } else {
                PopsListPanel {
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
        PopsDividedRows(rows: detail.lines, leadingInset: PopsSpacing.zero) { line in
            PurchaseDetailLineRow(line: line)
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
