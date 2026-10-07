import AppCore
import DesignSystem
import SwiftUI

/// A credit card's current cycle: when the money is due, and how much of the
/// limit is gone — mirroring `ios-account-facts.tsx`'s `CardFacts`.
internal struct CardFactsView: View {
    internal let account: Account
    internal let card: AccountCardCycle?

    internal var body: some View {
        if let card, let facts = CardFacts(account: account, card: card) {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text(AccountsCopy.cycleTitle)
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    Text(AccountsCopy.due(card.dueOn.formatted(date: .abbreviated, time: .omitted)))
                        .font(.popsSubheadline)
                        .foregroundStyle(
                            facts.isDueSoon ? Color.popsDestructive : Color.popsMutedForeground)
                    spend(facts)
                    meter(fraction: facts.fraction)
                    Text(
                        AccountsCopy.limitUse(
                            percent: facts.percentUsed, limit: facts.limit,
                            available: facts.available)
                    )
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private func spend(_ facts: CardFacts) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(AccountsCopy.spentThisCycle)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(facts.cycleSpend)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            Text(AccountsCopy.cycleChange(rose: facts.cycleSpendRose, by: facts.changeAmount))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private func meter(fraction: Double) -> some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.popsSurface)
                Capsule()
                    .fill(fraction > 0.3 ? Color.popsWarning : Color.popsAccent)
                    .frame(width: geometry.size.width * fraction)
            }
        }
        .frame(height: PopsSpacing.sm)
        .accessibilityHidden(true)
    }
}

/// The arithmetic and formatting behind ``CardFactsView``, pulled out so it is
/// a value a test can assert on without a view hierarchy.
internal struct CardFacts: Hashable, Sendable {
    internal let isDueSoon: Bool
    internal let fraction: Double
    internal let percentUsed: Int
    internal let limit: String
    internal let available: String
    internal let cycleSpend: String
    internal let cycleSpendRose: Bool
    internal let changeAmount: String

    internal init?(account: Account, card: AccountCardCycle) {
        guard card.creditLimitMinorUnits > 0 else { return nil }

        let currency = account.balance.currencyCode
        let owed = abs(account.balance.minorUnits)
        let rawFraction = Double(owed) / Double(card.creditLimitMinorUnits)
        fraction = min(max(rawFraction, 0), 1)
        percentUsed = Int((fraction * 100).rounded())
        limit = Self.money(card.creditLimitMinorUnits, currency)
        available = Self.money(max(card.creditLimitMinorUnits - owed, 0), currency)
        cycleSpend = Self.money(card.cycleSpendMinorUnits, currency)

        let change = card.cycleSpendMinorUnits - card.previousCycleSpendMinorUnits
        cycleSpendRose = change > 0
        changeAmount = Self.money(abs(change), currency)

        let daysUntilDue =
            Calendar.current.dateComponents([.day], from: Date(), to: card.dueOn).day ?? .max
        isDueSoon = daysUntilDue <= 7
    }

    private static func money(_ minorUnits: Int, _ currencyCode: String) -> String {
        MoneyAmount(minorUnits: minorUnits, currencyCode: currencyCode).formatted()
    }
}
