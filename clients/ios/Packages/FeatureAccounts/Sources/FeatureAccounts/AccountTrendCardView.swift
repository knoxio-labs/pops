import AppCore
import DesignSystem
import SwiftUI

/// The trend card: the sparkline, and the one sentence explaining it.
///
/// The colour follows the sign of the *balance itself*, not whether the line
/// rose or fell — the same call `pillars/design/src/screens/mobile/account.tsx`
/// makes: a loan's series is negative and stays the destructive tone even as
/// it climbs toward zero, because it is still debt. Points stay neutral
/// regardless of sign.
internal struct AccountTrendCardView: View {
    internal let account: Account
    internal let history: [AccountBalancePoint]

    private let presentation = AccountPresentation()

    internal var body: some View {
        if history.count > 1 {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text("Twelve months")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    AccountTrendView(history: history, color: color)
                    Text(line)
                        .font(.popsSubheadline)
                        .foregroundStyle(color)
                }
            }
        }
    }

    private var isPoints: Bool {
        account.balance.currencyCode == "MR" || account.balance.currencyCode == "PTS"
    }

    private var color: Color {
        guard !isPoints else { return .popsMutedForeground }
        return presentation.color(for: presentation.toneForBalance(account.balance.minorUnits))
    }

    private var line: String {
        let first = history.first?.balanceMinorUnits ?? 0
        let last = history.last?.balanceMinorUnits ?? 0
        let change = last - first
        let amount = MoneyAmount(
            minorUnits: abs(change), currencyCode: account.balance.currencyCode
        )
        .formatted()
        return "\(change >= 0 ? "Up" : "Down") \(amount) over 12 months"
    }
}
