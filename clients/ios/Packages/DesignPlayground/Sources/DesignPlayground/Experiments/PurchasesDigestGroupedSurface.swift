import AppCore
import DesignSystem
import SwiftUI

/// **Grouped** — the digest in the system's own vocabulary.
///
/// Nothing here is invented. Inset grouped containers, dividers that start
/// past the mark rather than cutting under it, a disclosure row where the
/// draft had a full-width button, and the thing needing action promoted to a
/// banner above the figure instead of a card wedged between two sections.
///
/// The bet: "finished" on iOS means indistinguishable from Settings, Wallet
/// and Health — and what read as raw in the draft was not a shortage of
/// decoration but a shortage of the platform's own structure. The life comes
/// from the one number the draft was missing: what this month is against the
/// last one.
internal struct PurchasesDigestGroupedSurface: View {
    internal let purchases: [Purchase]

    private let markSize: CGFloat = 32
    private let rankColumn: CGFloat = 18
    private let barHeight: CGFloat = 5
    private let recentCount = 4

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                if !unsettled.isEmpty { banner }
                hero
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

    /// Above the figure rather than below it, and tinted rather than neutral.
    /// A row of work sitting between two read-only sections is a row that gets
    /// scrolled past; the one thing on this screen somebody can act on should
    /// be the first thing they meet.
    private var banner: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsWarning)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(unsettled.count) unmatched")
                    .font(.popsSubheadline)
                    .fontWeight(.semibold)
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
        .background(
            Color.popsWarning.opacity(0.12), in: .rect(cornerRadius: PopsRadius.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .strokeBorder(Color.popsWarning.opacity(0.3), lineWidth: PopsBorder.hairline)
        )
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
        }
    }

    /// The comparison the draft had nowhere for. Withheld rather than faked
    /// when there is no earlier month: a first month shown as "100% down" is
    /// worse than a first month shown as a figure on its own.
    @ViewBuilder private var deltaLine: some View {
        if let delta = PurchasesPresentation.delta(
            for: latest.month, in: months, currency: currency),
            let previous = months.dropFirst().first
        {
            HStack(spacing: PopsSpacing.xs) {
                Image(systemName: delta.isUp ? "arrow.up.right" : "arrow.down.right")
                    .font(.popsCaption)
                Text(deltaSentence(delta, against: previous.month))
                    .font(.popsSubheadline)
            }
            .foregroundStyle(delta.isUp ? Color.popsWarning : Color.popsSuccess)
        }
    }

    private func deltaSentence(
        _ delta: (amount: MoneyAmount, isUp: Bool), against previous: Date
    ) -> String {
        let direction = delta.isUp ? "more" : "less"
        return
            "\(delta.amount.formatted()) \(direction) than \(PurchasesPresentation.shortMonth(previous))"
    }

    /// Ranked rows rather than the draft's tile scroller. A till name in a
    /// tile the width of an amount column truncates to nothing —
    /// `BUNNINGS WA…` — and a full-width row is the cheapest fix that does not
    /// involve tidying a name the pillar has to be searched by.
    private var leaderboard: some View {
        let spend = PurchasesPresentation.total(purchases, in: currency)
        let leaders = PurchasesPresentation.topMerchants(purchases, currency: currency, limit: 4)
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(title: "Where it went", note: currency)
            VStack(spacing: PopsSpacing.zero) {
                ForEach(Array(leaders.enumerated()), id: \.element.name) { index, leader in
                    leaderRow(index: index, leader: leader, of: spend)
                }
            }
            .padding(.horizontal, PopsSpacing.md)
            .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .strokeBorder(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
        }
    }

    private func leaderRow(
        index: Int, leader: (name: String, total: MoneyAmount), of spend: Int
    ) -> some View {
        let share = PurchasesPresentation.share(leader.total, of: spend)
        return VStack(alignment: .leading, spacing: PopsSpacing.sm) {
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
            bar(share: share, tint: Color.popsAccent)
                .padding(.leading, rankColumn + PopsSpacing.md)
        }
        .padding(.vertical, PopsSpacing.md)
    }

    private func bar(share: Double, tint: Color) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.popsSeparator.opacity(0.5))
                Capsule().fill(tint).frame(width: proxy.size.width * share)
            }
        }
        .frame(height: barHeight)
        .accessibilityHidden(true)
    }

    /// Starts past the mark, the way a system list's does, so the column of
    /// marks reads as a column rather than as a stack of cells.
    private var insetDivider: some View {
        PopsDivider()
            .padding(.leading, rankColumn + markSize + PopsSpacing.md + PopsSpacing.md)
    }

    @ViewBuilder private func marked(_ name: String) -> some View {
        if let purchase = purchases.first(where: { PurchasesPresentation.merchant($0) == name }) {
            PurchaseMark(purchase: purchase, size: markSize)
        }
    }

    /// The draft ended on a full-width outlined button, which is the loudest
    /// control on the screen spent on the least important action. A disclosure
    /// row as the container's last row is what a grouped list does, and it
    /// reads as "there is more below" rather than as "press this".
    private var recent: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(title: "Recent")
            VStack(spacing: PopsSpacing.zero) {
                ForEach(purchases.prefix(recentCount)) { purchase in
                    PurchaseCompactRow(purchase: purchase, markSize: markSize)
                    insetDivider
                }
                seeAll
            }
            .padding(.horizontal, PopsSpacing.md)
            .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .strokeBorder(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
        }
    }

    private var seeAll: some View {
        HStack(spacing: PopsSpacing.md) {
            Text("All \(purchases.count) purchases")
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsAccent)
            Spacer(minLength: PopsSpacing.sm)
            Image(systemName: "chevron.right")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .padding(.vertical, PopsSpacing.md)
        .contentShape(.rect)
    }
}
