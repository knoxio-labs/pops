import AppCore
import DesignSystem
import SwiftUI

/// A points account: what expires, what is coming in, and what it is loosely
/// worth — mirroring `ios-account-value-facts.tsx`'s `PointsFacts`. The worth
/// is in a different currency to the balance above it and is tagged as
/// indicative so it is never mistaken for money.
internal struct PointsFactsView: View {
    internal let account: Account
    internal let points: AccountPointsPlan?

    internal var body: some View {
        if let points {
            let perYear = Int((Double(points.earnedLast90Days) * (365.0 / 90.0)).rounded())
            let worth = Int((Double(account.balance.minorUnits) * points.centsPerPoint).rounded())
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text("Points")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    HStack(spacing: PopsSpacing.lg) {
                        stat(
                            label: "Expiring", value: "\(points.expiringPoints) pts",
                            hint: points.expiresOn.formatted(date: .abbreviated, time: .omitted))
                        stat(
                            label: "Earned in 90 days", value: "\(points.earnedLast90Days) pts",
                            hint: "\(perYear)/yr at this rate")
                    }
                    Text("Worth about \(money(worth)) · Indicative only")
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private func stat(label: String, value: String, hint: String) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(value)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            Text(hint)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func money(_ minorUnits: Int) -> String {
        MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD").formatted()
    }
}
