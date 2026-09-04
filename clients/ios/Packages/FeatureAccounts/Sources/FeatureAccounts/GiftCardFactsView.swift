import AppCore
import DesignSystem
import SwiftUI

/// A gift card: what is left of what was loaded, and whether it survives its
/// expiry — mirroring `ios-account-value-facts.tsx`'s `GiftCardFacts`. Renders
/// nothing when either the original value or an expiry date is missing, the
/// same call the design makes.
internal struct GiftCardFactsView: View {
    internal let account: Account
    internal let originalValueMinorUnits: Int?

    internal var body: some View {
        if let originalValueMinorUnits, let expiresOn = account.expiresOn,
            originalValueMinorUnits > 0
        {
            let fraction = Double(account.balance.minorUnits) / Double(originalValueMinorUnits)
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text("Stored value")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    meter(fraction: fraction)
                    Text(
                        "\(money(account.balance.minorUnits)) left of \(money(originalValueMinorUnits))"
                    )
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                    Text("Expires \(expiresOn.formatted(date: .abbreviated, time: .omitted))")
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private func meter(fraction: Double) -> some View {
        let clamped = min(max(fraction, 0), 1)
        return GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.popsSurface)
                Capsule().fill(Color.popsAccent).frame(width: geometry.size.width * clamped)
            }
        }
        .frame(height: PopsSpacing.sm)
        .accessibilityHidden(true)
    }

    private func money(_ minorUnits: Int) -> String {
        MoneyAmount(minorUnits: minorUnits, currencyCode: account.balance.currencyCode).formatted()
    }
}
