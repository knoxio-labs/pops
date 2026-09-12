import AppCore
import DesignSystem
import SwiftUI

/// **Composed** — the answer assembled from the other three rather than
/// chosen from among them.
///
/// What came from where, so the next reader does not have to diff four files:
///
/// | Band            | From    | Why that one |
/// | --------------- | ------- | ------------ |
/// | The figure      | Glass   | Depth, over a wash for it to bend |
/// | The delta       | Grouped | The one number none of the drafts had |
/// | Unmatched       | Glass   | Same material as the figure it sits under |
/// | Where it went   | Grouped | Ranked rows, so a till name gets the width |
/// | Recent          | Glass   | |
/// | All N purchases | Glass   | A capsule, not a full-width outlined button |
///
/// Two deliberate departures from a literal reading of that table.
///
/// **The bars are gone from Where it went.** They were what ranked the rows in
/// `Grouped`; without them the rank numeral does that work alone, which is
/// what it was there for. The share each merchant holds is a figure this
/// screen no longer states — `Chart` is where that lives.
///
/// **Where it went is glass, not the opaque card it wore in `Grouped`.** Every
/// other container on the page refracts, and one flat card between two that do
/// not reads as a section that failed to load rather than as a section with a
/// different job. The rows are `Grouped`'s; the material is the page's.
internal struct PurchasesDigestComposedSurface: View {
    internal let purchases: [Purchase]

    private let markSize: CGFloat = 34
    private let rankColumn: CGFloat = 18
    private let heroWash: CGFloat = 190
    private let recentCount = 4

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                hero
                if !unsettled.isEmpty { unmatched }
                leaderboard
                recent
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
    }

    private var months: [(month: Date, purchases: [Purchase])] {
        PurchasesPresentation.byMonth(purchases)
    }

    private var latest: (month: Date, purchases: [Purchase]) {
        months.first ?? (month: .now, purchases: [])
    }

    private var unsettled: [Purchase] { purchases.filter(\.status.isUnsettled) }

    private var currency: String {
        PurchasesPresentation.totals(purchases).first?.currencyCode ?? Fixtures.aud
    }

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
            deltaLine
            ForEach(totals.dropFirst(), id: \.currencyCode) { total in
                Text("and \(total.formatted())")
                    .font(.popsSubheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Text(countLine(totals))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(PopsSpacing.lg)
        .background(alignment: .topTrailing) { wash }
        .clipShape(RoundedRectangle(cornerRadius: PopsRadius.card))
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
    }

    /// Withheld rather than faked when there is no earlier month: a first
    /// month shown as a fall from zero is a lie about a person's spending.
    @ViewBuilder private var deltaLine: some View {
        if let delta = PurchasesPresentation.delta(
            for: latest.month, in: months, currency: currency),
            let previous = months.dropFirst().first
        {
            HStack(spacing: PopsSpacing.xs) {
                Image(systemName: delta.isUp ? "arrow.up.right" : "arrow.down.right")
                    .font(.popsCaption)
                Text(
                    "\(delta.amount.formatted()) \(delta.isUp ? "more" : "less") than \(PurchasesPresentation.shortMonth(previous.month))"
                )
                .font(.popsSubheadline)
            }
            .foregroundStyle(delta.isUp ? Color.popsWarning : Color.popsSuccess)
        }
    }

    private var wash: some View {
        RadialGradient(
            colors: [Color.popsAccent.opacity(0.55), Color.popsAccent.opacity(0)],
            center: .topTrailing,
            startRadius: PopsSpacing.zero,
            endRadius: heroWash
        )
        .frame(width: heroWash, height: heroWash)
        .accessibilityHidden(true)
    }

    private func countLine(_ totals: [MoneyAmount]) -> String {
        let count = latest.purchases.count
        let purchases = count == 1 ? "1 purchase" : "\(count) purchases"
        return totals.count > 1 ? "\(purchases) in \(totals.count) currencies" : purchases
    }

    private var unmatched: some View {
        HStack(spacing: PopsSpacing.md) {
            HStack(spacing: -PopsSpacing.sm) {
                ForEach(unsettled.prefix(3)) { purchase in
                    PurchaseMark(purchase: purchase, size: markSize)
                        .overlay(
                            RoundedRectangle(cornerRadius: PopsRadius.control)
                                .strokeBorder(
                                    Color.popsBackground, lineWidth: PopsBorder.emphasis)
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
        .padding(PopsSpacing.md)
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .contentShape(.rect)
    }

    /// `Grouped`'s ranked rows with the bar taken out, so the numeral carries
    /// the ranking and a till name gets the full width of the row minus its
    /// amount.
    private var leaderboard: some View {
        let leaders = PurchasesPresentation.topMerchants(purchases, currency: currency, limit: 4)
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(title: "Where it went", note: currency)
            VStack(spacing: PopsSpacing.zero) {
                ForEach(Array(leaders.enumerated()), id: \.element.name) { index, leader in
                    leaderRow(index: index, leader: leader)
                    if leader.name != leaders.last?.name { insetDivider }
                }
            }
            .padding(.horizontal, PopsSpacing.md)
            .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        }
    }

    private func leaderRow(index: Int, leader: (name: String, total: MoneyAmount)) -> some View {
        HStack(spacing: PopsSpacing.md) {
            Text("\(index + 1)")
                .font(.popsCaption)
                .monospacedDigit()
                .foregroundStyle(Color.popsMutedForeground)
                .frame(width: rankColumn, alignment: .leading)
            marked(leader.name)
            Text(leader.name)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: PopsSpacing.sm)
            Text(leader.total.formatted())
                .font(.popsSubheadline)
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.md)
    }

    private var insetDivider: some View {
        PopsDivider()
            .padding(.leading, rankColumn + markSize + PopsSpacing.md + PopsSpacing.md)
    }

    @ViewBuilder private func marked(_ name: String) -> some View {
        if let purchase = purchases.first(where: { PurchasesPresentation.merchant($0) == name }) {
            PurchaseMark(purchase: purchase, size: markSize)
        }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(title: "Recent")
            VStack(spacing: PopsSpacing.zero) {
                ForEach(purchases.prefix(recentCount)) { purchase in
                    PurchaseCompactRow(purchase: purchase, markSize: markSize)
                    if purchase.id != purchases.prefix(recentCount).last?.id { PopsDivider() }
                }
            }
            .padding(.horizontal, PopsSpacing.md)
            .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
            seeAll
        }
    }

    private var seeAll: some View {
        HStack(spacing: PopsSpacing.sm) {
            Text("All \(purchases.count) purchases")
                .font(.popsSubheadline)
                .fontWeight(.medium)
                .foregroundStyle(Color.popsAccent)
            Image(systemName: "chevron.right")
                .font(.popsCaption)
                .foregroundStyle(Color.popsAccent)
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.md)
        .playgroundGlass(in: Capsule())
        .frame(maxWidth: .infinity)
        .contentShape(.rect)
    }
}
