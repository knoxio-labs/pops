import AppCore
import DesignSystem
import SwiftUI

/// **Chart** — every figure on the screen earns a mark on the page.
///
/// The month's total gets the months either side of it as bars, the unmatched
/// count becomes a proportion answered rather than a tally, and each merchant
/// carries its share of the currency's spend. Nothing here is decoration: each
/// mark is a number the draft already had and stated in words.
///
/// The bet: the draft looked raw because it was a column of figures with
/// nothing relating them, and what a digest is for is exactly that relation —
/// is this month heavy, is this merchant most of it, is any of this settled.
///
/// Every figure is still derived from rows already loaded. A three-bar trend
/// off three months of fixtures is honest; a twelve-month trend would need the
/// mobile surface to serve something it does not, and would be a chart of
/// whatever happened to be cached.
internal struct PurchasesDigestChartSurface: View {
    internal let purchases: [Purchase]

    private let markSize: CGFloat = 30
    private let trendHeight: CGFloat = 64
    private let trendBarWidth: CGFloat = 34
    private let barHeight: CGFloat = 6
    private let meterHeight: CGFloat = 10
    private let trendMonths = 6
    private let recentCount = 4

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                hero
                meter
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

    private var currency: String {
        PurchasesPresentation.totals(purchases).first?.currencyCode ?? Fixtures.aud
    }

    private var hero: some View {
        let totals = PurchasesPresentation.totals(latest.purchases)
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
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
                ForEach(totals.dropFirst(), id: \.currencyCode) { total in
                    Text("and \(total.formatted())")
                        .font(.popsSubheadline)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            trend
        }
    }

    /// The months either side, in the one currency the bars can be compared
    /// in. The current month is the accent and the rest are separator-weight,
    /// so the comparison is made by the eye rather than by reading three
    /// figures.
    private var trend: some View {
        let bars = PurchasesPresentation.trend(purchases, currency: currency, limit: trendMonths)
        let peak = max(bars.map(\.minorUnits).max() ?? 0, 1)
        return HStack(alignment: .bottom, spacing: PopsSpacing.md) {
            ForEach(bars, id: \.month) { bar in
                VStack(spacing: PopsSpacing.sm) {
                    Spacer(minLength: PopsSpacing.zero)
                    RoundedRectangle(cornerRadius: PopsRadius.control)
                        .fill(
                            bar.month == latest.month
                                ? Color.popsAccent : Color.popsSeparator
                        )
                        .frame(
                            maxWidth: trendBarWidth,
                            maxHeight: trendHeight * (Double(bar.minorUnits) / Double(peak))
                        )
                        .frame(height: trendHeight * (Double(bar.minorUnits) / Double(peak)))
                    Text(PurchasesPresentation.shortMonth(bar.month))
                        .font(.popsCaption)
                        .foregroundStyle(
                            bar.month == latest.month
                                ? Color.popsForeground : Color.popsMutedForeground
                        )
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(height: trendHeight + PopsSpacing.xl)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Monthly spend in \(currency): "
                + bars.map {
                    "\(PurchasesPresentation.shortMonth($0.month)) "
                        + MoneyAmount(minorUnits: $0.minorUnits, currencyCode: currency).formatted()
                }.joined(separator: ", ")
        )
    }

    /// A proportion rather than a count. "8 unmatched" says how much work
    /// there is; "6 of 14 accounted for" says how much of it is done, which is
    /// the question somebody looking at a reconciliation backlog is actually
    /// asking. Counts, not money — the money is in currencies that do not add
    /// up and the count always does.
    private var meter: some View {
        let answered = PurchasesPresentation.accounted(purchases)
        let share = answered.total == 0 ? 0 : Double(answered.settled) / Double(answered.total)
        return VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                Text("\(answered.settled) of \(answered.total) accounted for")
                    .font(.popsSubheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                Text("\(answered.total - answered.settled) left")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsWarning)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.popsWarning.opacity(0.25))
                    Capsule().fill(Color.popsSuccess).frame(width: proxy.size.width * share)
                }
            }
            .frame(height: meterHeight)
        }
        .padding(PopsSpacing.md)
        .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .strokeBorder(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .accessibilityElement(children: .combine)
    }

    private var leaderboard: some View {
        let spend = PurchasesPresentation.total(purchases, in: currency)
        let leaders = PurchasesPresentation.topMerchants(purchases, currency: currency, limit: 4)
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(title: "Where it went", note: currency)
            VStack(spacing: PopsSpacing.lg) {
                ForEach(leaders, id: \.name) { leader in
                    leaderRow(leader, of: spend)
                }
            }
        }
    }

    private func leaderRow(
        _ leader: (name: String, total: MoneyAmount), of spend: Int
    ) -> some View {
        let share = PurchasesPresentation.share(leader.total, of: spend)
        return VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.md) {
                marked(leader.name)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(leader.name)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsForeground)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(share.formatted(.percent.precision(.fractionLength(0))))
                        .font(.popsCaption)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.sm)
                Text(leader.total.formatted())
                    .font(.popsSubheadline)
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                    .layoutPriority(1)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.popsSeparator.opacity(0.5))
                    Capsule().fill(Color.popsAccent).frame(width: proxy.size.width * share)
                }
            }
            .frame(height: barHeight)
            .accessibilityHidden(true)
        }
    }

    @ViewBuilder private func marked(_ name: String) -> some View {
        if let purchase = purchases.first(where: { PurchasesPresentation.merchant($0) == name }) {
            PurchaseMark(purchase: purchase, size: markSize)
        }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            DigestSectionLabel(title: "Recent")
            VStack(spacing: PopsSpacing.zero) {
                ForEach(purchases.prefix(recentCount)) { purchase in
                    PurchaseCompactRow(purchase: purchase, markSize: markSize)
                    PopsDivider()
                }
            }
            HStack(spacing: PopsSpacing.sm) {
                Text("All \(purchases.count) purchases")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsAccent)
                Image(systemName: "chevron.right")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsAccent)
                Spacer(minLength: PopsSpacing.sm)
            }
            .padding(.vertical, PopsSpacing.sm)
            .contentShape(.rect)
        }
    }
}
