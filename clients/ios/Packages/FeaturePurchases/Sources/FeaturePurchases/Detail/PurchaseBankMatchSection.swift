import AppCore
import DesignSystem
import SwiftUI

/// Where a purchase stands against the bank: its settlement, how much is matched when only part
/// of it is, and each matched transaction with how the match was made.
///
/// With nothing matched it is the settlement row alone.
public struct PurchaseBankMatchSection: View {
    private let status: PurchaseSettlement
    private let presentation: PurchaseBankMatchPresentation

    /// Creates the section from a purchase detail's settlement and bank match.
    public init(
        status: PurchaseSettlement, accounting: PurchaseAccounting?, charges: [PurchaseCharge]
    ) {
        self.status = status
        presentation = PurchaseBankMatchPresentation(accounting: accounting, charges: charges)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsSectionHeader(title: PurchaseDetailCopy.bankMatchTitle)
            PopsListPanel {
                VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                    PurchaseDetailMatchRow(
                        status: status,
                        matchedOf: presentation.matchedOf,
                        unmatched: presentation.unmatched)
                    ForEach(presentation.rows) { row in
                        PopsDivider()
                        PurchaseBankMatchRow(row: row)
                    }
                }
            }
        }
    }
}

internal struct PurchaseBankMatchRow: View {
    internal let row: PurchaseBankMatchPresentation.Row

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(row.title)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(2)
                if let detail = row.detail {
                    Text(detail)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Label(row.method, systemImage: row.methodSymbol)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            VStack(alignment: .trailing, spacing: PopsSpacing.xs) {
                Text(row.amount)
                    .font(.popsBody)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                if let onStatement = row.onStatement {
                    Text(onStatement)
                        .font(.popsCaption)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                        .lineLimit(1)
                }
            }
            .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.sm)
        .accessibilityElement(children: .combine)
    }
}
