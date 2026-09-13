import AppCore
import DesignSystem
import SwiftUI

/// **Digest** — a home that answers four questions instead of one.
///
/// The list is not the screen here; it is the last band on it. Above it sit
/// the month's figure, the reconciliation gap as a single strip, and where the
/// money actually went — so spend insight, triage and the archive each get a
/// lane, and "see all" is what leads to the history rather than the history
/// being the front door.
///
/// The bet: a phone opened once a week wants a state of things, and the person
/// who wants row 40 of the ledger knows to go looking for it.
///
/// Every figure here is derived from the rows already loaded — there is no
/// mobile analytics route, and inventing one in a design is how a screen ships
/// that the backend cannot feed.
internal struct PurchasesDigestSurface: View {
    internal let purchases: [Purchase]

    private let stripMark: CGFloat = 28
    private let leaderMark: CGFloat = 34
    private let recentCount = 4

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                hero
                if !unsettled.isEmpty { needsYou }
                leaderboard
                recent
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
    }

    private var latest: (month: Date, purchases: [Purchase]) {
        PurchasesPresentation.byMonth(purchases).first ?? (month: .now, purchases: [])
    }

    private var unsettled: [Purchase] { purchases.filter(\.status.isUnsettled) }

    /// The month's figure. One per currency, the largest set in `popsAmount`
    /// and the rest beneath it — rather than one blended number, which for
    /// this data would be arithmetic on two different kinds of money.
    private var hero: some View {
        let totals = PurchasesPresentation.totals(latest.purchases)
        return VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(PurchasesPresentation.month(latest.month).uppercased())
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            if let headline = totals.first {
                Text(headline.formatted())
                    .font(.popsAmount)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            HStack(spacing: PopsSpacing.xs) {
                ForEach(totals.dropFirst(), id: \.currencyCode) { total in
                    Text("+ \(total.formatted())")
                        .font(.popsSubheadline)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            Text(countLine(totals))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    /// The count, and the currency spread only when there is one worth
    /// mentioning. "1 currencies" is the kind of sentence a screen says when
    /// nobody read it back.
    private func countLine(_ totals: [MoneyAmount]) -> String {
        let purchases =
            latest.purchases.count == 1 ? "1 purchase" : "\(latest.purchases.count) purchases"
        return totals.count > 1 ? "\(purchases) in \(totals.count) currencies" : purchases
    }

    private var needsYou: some View {
        PopsCard {
            HStack(spacing: PopsSpacing.md) {
                HStack(spacing: -PopsSpacing.md) {
                    ForEach(unsettled.prefix(3)) { purchase in
                        PurchaseMark(purchase: purchase, size: stripMark)
                            .overlay(
                                RoundedRectangle(cornerRadius: PopsRadius.control)
                                    .strokeBorder(
                                        Color.popsSurface, lineWidth: PopsBorder.emphasis)
                            )
                    }
                }
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text("\(unsettled.count) unmatched")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text("Nothing in finance explains these yet.")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .lineLimit(2)
                }
                Spacer(minLength: PopsSpacing.sm)
                Image(systemName: "chevron.right")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    /// Where the money went, in the one currency most of it is in. Named as
    /// that currency rather than presented as the whole truth, because a
    /// leaderboard silently dropping a foreign row is a leaderboard that lies
    /// by omission.
    private var leaderboard: some View {
        let currency = PurchasesPresentation.totals(purchases).first?.currencyCode ?? Fixtures.aud
        let leaders = PurchasesPresentation.topMerchants(purchases, currency: currency, limit: 5)
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.sm) {
                Text("WHERE IT WENT")
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
                Spacer(minLength: PopsSpacing.sm)
                Text(currency)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    ForEach(leaders, id: \.name) { leader in
                        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                            marked(leader.name)
                            Text(leader.name)
                                .font(.popsCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                                .lineLimit(2)
                            Text(leader.total.formatted())
                                .font(.popsSubheadline)
                                .fontWeight(.semibold)
                                .monospacedDigit()
                                .foregroundStyle(Color.popsForeground)
                                .lineLimit(1)
                        }
                        .frame(width: PopsSize.amountColumn, alignment: .leading)
                    }
                }
            }
        }
    }

    /// The leaderboard marks a name rather than a purchase, so it borrows the
    /// first purchase at that merchant to draw the same mark the rows do.
    @ViewBuilder private func marked(_ name: String) -> some View {
        if let purchase = purchases.first(where: { PurchasesPresentation.merchant($0) == name }) {
            PurchaseMark(purchase: purchase, size: leaderMark)
        }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text("RECENT")
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            VStack(spacing: PopsSpacing.zero) {
                ForEach(purchases.prefix(recentCount)) { purchase in
                    row(purchase)
                    PopsDivider()
                }
            }
            PopsButton("See all \(purchases.count) purchases") {}
        }
    }

    private func row(_ purchase: Purchase) -> some View {
        HStack(spacing: PopsSpacing.md) {
            PurchaseMark(purchase: purchase, size: stripMark)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchasesPresentation.merchant(purchase))
                    .font(.popsSubheadline)
                    .foregroundStyle(
                        PurchasesPresentation.isUnattributed(purchase)
                            ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .lineLimit(1)
                Text(PurchasesPresentation.day(purchase))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(purchase.total.formatted())
                .font(.popsSubheadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.sm)
    }
}
