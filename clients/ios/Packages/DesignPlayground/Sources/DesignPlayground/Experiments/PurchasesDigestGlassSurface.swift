import AppCore
import DesignSystem
import SwiftUI

/// **Glass** — the digest rendered in what iOS 26 actually draws with.
///
/// The figure sits on a glass panel over a tinted ground, the unmatched strip
/// is a glass capsule, and the merchant chips are glass. Glass needs something
/// behind it or it is an expensive way to draw grey, so the hero carries a
/// wash of the accent tint for it to refract — that wash is the only place
/// this surface introduces colour it was not given.
///
/// The bet: the draft looked raw because it was flat, and on this platform
/// depth is not decoration — it is what every system surface does. A screen
/// built only from opaque rounded rectangles reads as a cross-platform form
/// on a device whose own chrome refracts.
///
/// What it risks: glass over a busy ground is unreadable, and this is the
/// variant to hold at AX5 in dark before believing it. The whole reason this
/// playground is native rather than a web frame is that this effect cannot be
/// judged in CSS — so judge it here, on the device, not from the screenshot.
internal struct PurchasesDigestGlassSurface: View {
    internal let purchases: [Purchase]

    private let markSize: CGFloat = 34
    private let chipWidth: CGFloat = 148
    private let heroWash: CGFloat = 190
    private let recentCount = 4

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                hero
                if !unsettled.isEmpty { unmatchedCapsule }
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
            HStack(spacing: PopsSpacing.xs) {
                ForEach(totals.dropFirst(), id: \.currencyCode) { total in
                    Text("and \(total.formatted())")
                        .font(.popsSubheadline)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
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

    /// Something for the glass to bend. Anchored to the corner rather than
    /// centred so the refraction falls across the panel instead of sitting
    /// symmetrically behind the figure, which reads as a gradient rather than
    /// as depth.
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

    private var unmatchedCapsule: some View {
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
    }

    /// Chips wide enough for a till name to get two readable lines, which the
    /// draft's amount-column tiles could not — `BUNNINGS WA…` is not a
    /// merchant. Still a scroller, because on this variant the row of chips is
    /// part of the texture.
    private var leaderboard: some View {
        let leaders = PurchasesPresentation.topMerchants(purchases, currency: currency, limit: 5)
        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(title: "Where it went", note: currency)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    ForEach(leaders, id: \.name) { leader in
                        chip(leader)
                    }
                }
                .padding(.vertical, PopsSpacing.xs)
            }
        }
    }

    private func chip(_ leader: (name: String, total: MoneyAmount)) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            marked(leader.name)
            Text(leader.name)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(leader.total.formatted())
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(width: chipWidth, alignment: .leading)
        .padding(PopsSpacing.md)
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
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
