import AppCore
import DesignSystem
import SwiftUI

/// Checking and savings: what the month did, and how low the balance went —
/// mirroring `ios-account-facts.tsx`'s `CheckingFacts`. Read off the closing
/// balances rather than the transactions, which the note says out loud: money
/// in and money out are not counted separately here.
internal struct CheckingFactsView: View {
    internal let account: Account
    internal let history: [AccountBalancePoint]

    internal var body: some View {
        if let facts = CheckingFacts(history: history) {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text("Month on month")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    HStack(spacing: PopsSpacing.lg) {
                        stat(label: "Net in \(facts.lastMonth)", minorUnits: facts.netThisMonth)
                        stat(label: "Average month", minorUnits: facts.averageMonth)
                    }
                    stat(
                        label: "Lowest it went (\(facts.floorMonth))",
                        minorUnits: facts.floorBalance)
                    Text(
                        "From closing balances, not transactions: money in and out are not counted apart."
                    )
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private func stat(label: String, minorUnits: Int) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(
                MoneyAmount(minorUnits: minorUnits, currencyCode: account.balance.currencyCode)
                    .formatted()
            )
            .font(.popsHeadline)
            .foregroundStyle(Color.popsForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The arithmetic behind ``CheckingFactsView``, pulled out so it is a value a
/// test can assert on without a view hierarchy.
internal struct CheckingFacts: Hashable, Sendable {
    internal let lastMonth: String
    internal let netThisMonth: Int
    internal let averageMonth: Int
    internal let floorMonth: String
    internal let floorBalance: Int

    internal init?(history: [AccountBalancePoint]) {
        guard history.count >= 2, let last = history.last, let prior = history.dropLast().last,
            let first = history.first
        else { return nil }
        let floor = history.min { $0.balanceMinorUnits < $1.balanceMinorUnits }
        guard let floor else { return nil }

        lastMonth = last.month
        netThisMonth = last.balanceMinorUnits - prior.balanceMinorUnits
        averageMonth =
            history.count > 1
            ? (last.balanceMinorUnits - first.balanceMinorUnits) / (history.count - 1) : 0
        floorMonth = floor.month
        floorBalance = floor.balanceMinorUnits
    }
}
