import AppCore
import DesignSystem
import SwiftUI

/// The tail of an account's dashboard: its most recent transactions.
///
/// A minimal local row rather than `FeatureTransactions.TransactionRowView` —
/// `ModuleBoundaryTests.noFeatureImportsAnotherFeature` forbids one feature
/// naming another, precisely so two screens do not end up silently coupled to
/// the same row type. If a shared transaction row is ever worth having, it
/// belongs in `DesignSystem`, not borrowed across a feature boundary.
internal struct AccountRecentTransactionsView: View {
    internal let transactions: [AppCore.Transaction]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(AccountsCopy.recentTransactionsTitle)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            if transactions.isEmpty {
                Text(AccountsCopy.noRecentTransactions)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            } else {
                PopsCard {
                    VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                        ForEach(transactions) { transaction in
                            if transaction.id != transactions.first?.id { PopsDivider() }
                            row(transaction)
                        }
                    }
                }
            }
        }
    }

    private func row(_ transaction: AppCore.Transaction) -> some View {
        PopsRow(
            title: transaction.description,
            subtitle: transaction.date.formatted(date: .abbreviated, time: .omitted)
        ) {
            Text(transaction.amount.formatted())
                .font(.popsMonospaced)
                .foregroundStyle(
                    transaction.amount.minorUnits > 0 ? Color.popsSuccess : Color.popsForeground)
        }
    }
}
