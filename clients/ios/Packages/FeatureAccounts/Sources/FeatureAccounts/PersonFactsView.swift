import AppCore
import DesignSystem
import SwiftUI

/// A person ledger: how many entries make it up, and the biggest single move
/// — mirroring `ios-account-value-facts.tsx`'s `PersonFacts`, minus its
/// "Settle up" button. Settling a ledger writes a transaction, which is a
/// desktop-scale action this read-only dashboard does not offer.
internal struct PersonFactsView: View {
    internal let account: Account
    internal let history: [AccountBalancePoint]

    internal var body: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text("Ledger")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(summary)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                if let move = biggestMove {
                    Text("Biggest single move: \(move)")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private var who: String { account.contact ?? account.name }

    private var summary: String {
        guard account.balance.minorUnits != 0 else { return "Settled up with \(who)" }
        return "\(account.transactionCount) entries with \(who)"
    }

    private var biggestMove: String? {
        guard history.count > 1 else { return nil }
        var best: (delta: Int, month: String) = (0, "")
        for index in 1..<history.count {
            let delta = history[index].balanceMinorUnits - history[index - 1].balanceMinorUnits
            if abs(delta) > abs(best.delta) {
                best = (delta, history[index].month)
            }
        }
        guard best.delta != 0 else { return nil }
        let amount = MoneyAmount(
            minorUnits: abs(best.delta), currencyCode: account.balance.currencyCode
        )
        .formatted()
        return "\(best.delta > 0 ? "+" : "−")\(amount) in \(best.month)"
    }
}
