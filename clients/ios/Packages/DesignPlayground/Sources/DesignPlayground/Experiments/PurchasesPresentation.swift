import AppCore
import DesignSystem
import Foundation
import SwiftUI

/// What every variant of the purchases home agrees on, so the four of them
/// differ in shape rather than in vocabulary.
///
/// A mark, a settlement badge and a date read the same in all four. If they
/// did not, a reviewer comparing two variants would be comparing eight
/// changes, and the thing being decided would be whichever one they noticed
/// first.
@MainActor
internal enum PurchasesPresentation {
    /// The merchant as the pillar holds it. Never tidied, never title-cased:
    /// `merchantEntityName` is a label the extractor read off a till, and a
    /// screen that prettifies it is a screen showing something the pillar
    /// cannot be searched by.
    static func merchant(_ purchase: Purchase) -> String {
        purchase.merchantName ?? "Merchant not recognised"
    }

    static func isUnattributed(_ purchase: Purchase) -> Bool {
        purchase.merchantName == nil
    }

    static func day(_ purchase: Purchase) -> String {
        purchase.orderedOn.formatted(.dateTime.day().month(.abbreviated))
    }

    static func month(_ date: Date) -> String {
        date.formatted(.dateTime.month(.wide).year())
    }

    static func items(_ purchase: Purchase) -> String {
        purchase.itemCount == 1 ? "1 item" : "\(purchase.itemCount) items"
    }

    /// The badge's words. Short enough to sit in a row, and phrased from the
    /// reader's side — `awaiting_settlement` is a pillar's word for "nothing
    /// in the bank explains this yet".
    static func label(for status: PurchaseSettlement) -> String {
        switch status {
        case .awaitingSettlement: "Unmatched"
        case .linked: "Matched"
        case .partial: "Part matched"
        case .settledCash: "Cash"
        case .ignored: "Ignored"
        case .unrecognised(let raw): raw
        }
    }

    /// Why a row is still open, said in a sentence rather than a status word.
    /// Only the two unsettled states have one; the rest are answers, not
    /// questions.
    static func reason(for purchase: Purchase) -> String? {
        if isUnattributed(purchase) { return "No merchant was recognised on this receipt." }
        switch purchase.status {
        case .awaitingSettlement: return "No transaction in finance explains this yet."
        case .partial: return "Part of this is explained. The rest is not."
        case .linked, .settledCash, .ignored, .unrecognised: return nil
        }
    }

    static func tone(for status: PurchaseSettlement) -> Color {
        switch status {
        case .awaitingSettlement, .partial: Color.popsWarning
        case .linked, .settledCash: Color.popsSuccess
        case .ignored, .unrecognised: Color.popsMutedForeground
        }
    }

    /// Purchases grouped into calendar months, newest first, keeping the order
    /// they arrived in inside each group.
    static func byMonth(_ purchases: [Purchase]) -> [(month: Date, purchases: [Purchase])] {
        let calendar = Calendar.current
        var order: [Date] = []
        var grouped: [Date: [Purchase]] = [:]
        for purchase in purchases {
            let key =
                calendar.date(
                    from: calendar.dateComponents([.year, .month], from: purchase.orderedOn))
                ?? purchase.orderedOn
            if grouped[key] == nil { order.append(key) }
            grouped[key, default: []].append(purchase)
        }
        return order.map { (month: $0, purchases: grouped[$0] ?? []) }
    }

    /// One total per currency, largest first.
    ///
    /// Per currency and never summed, because the purchases pillar's own
    /// analytics refuses a cross-currency total — "there is no such number" is
    /// its wording. A screen that adds AUD to USD to show one tidy figure is
    /// not approximating; it is stating something false.
    static func totals(_ purchases: [Purchase]) -> [MoneyAmount] {
        var byCurrency: [String: Int] = [:]
        for purchase in purchases {
            byCurrency[purchase.total.currencyCode, default: 0] += purchase.total.minorUnits
        }
        return
            byCurrency
            .map { MoneyAmount(minorUnits: $0.value, currencyCode: $0.key) }
            .sorted { $0.minorUnits > $1.minorUnits }
    }

    /// Merchants by what was spent at them, in one currency, largest first.
    /// Rows the pillar could not attribute are left out rather than pooled
    /// under one heading: "unattributed" is not a merchant, and a leaderboard
    /// that ranks it alongside real ones invents a shop.
    static func topMerchants(
        _ purchases: [Purchase], currency: String, limit: Int
    ) -> [(name: String, total: MoneyAmount)] {
        var byMerchant: [String: Int] = [:]
        for purchase in purchases
        where purchase.total.currencyCode == currency && !isUnattributed(purchase) {
            byMerchant[merchant(purchase), default: 0] += purchase.total.minorUnits
        }
        return
            byMerchant
            .map { (name: $0.key, total: MoneyAmount(minorUnits: $0.value, currencyCode: currency)) }
            .sorted { $0.total.minorUnits > $1.total.minorUnits }
            .prefix(limit)
            .map { $0 }
    }
}

/// The figures a finished digest wants beside its totals — a comparison, a
/// share, a proportion accounted for.
///
/// Every one is computed from rows already loaded. There is no mobile
/// analytics route, so a digest that wanted a figure the phone cannot derive
/// would be a design the backend cannot feed.
@MainActor
extension PurchasesPresentation {
    /// What the month before came to, in the same currency, and which way it
    /// moved. `nil` when there is no earlier month to compare against — the
    /// first month a person uses the app has no delta, and inventing one by
    /// treating the absence as zero would read as a 100% fall.
    static func delta(
        for month: Date, in months: [(month: Date, purchases: [Purchase])], currency: String
    ) -> (amount: MoneyAmount, isUp: Bool)? {
        guard
            let index = months.firstIndex(where: { $0.month == month }),
            months.indices.contains(index + 1)
        else { return nil }
        let current = total(months[index].purchases, in: currency)
        let previous = total(months[index + 1].purchases, in: currency)
        guard previous != 0 else { return nil }
        return (
            amount: MoneyAmount(minorUnits: abs(current - previous), currencyCode: currency),
            isUp: current > previous
        )
    }

    static func total(_ purchases: [Purchase], in currency: String) -> Int {
        purchases
            .filter { $0.total.currencyCode == currency }
            .reduce(0) { $0 + $1.total.minorUnits }
    }

    /// A merchant's share of the currency's spend, 0...1, for a bar that has
    /// to be drawn at some width.
    static func share(_ amount: MoneyAmount, of total: Int) -> Double {
        guard total > 0 else { return 0 }
        return min(max(Double(amount.minorUnits) / Double(total), 0), 1)
    }

    /// How much of the history is answered — the count, not the money, because
    /// the money is in currencies that do not add up and the count always
    /// does.
    static func accounted(_ purchases: [Purchase]) -> (settled: Int, total: Int) {
        (settled: purchases.filter { !$0.status.isUnsettled }.count, total: purchases.count)
    }

    /// The last `limit` months, oldest first, as one figure each in a single
    /// currency — the shape a trend strip draws. Oldest first because a bar
    /// chart of time reads left to right, while ``byMonth`` is newest first
    /// because a list does not.
    static func trend(
        _ purchases: [Purchase], currency: String, limit: Int
    ) -> [(month: Date, minorUnits: Int)] {
        byMonth(purchases)
            .prefix(limit)
            .map { (month: $0.month, minorUnits: total($0.purchases, in: currency)) }
            .reversed()
    }

    static func shortMonth(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated))
    }
}

/// The merchant as a mark: initials on a stable tint, or a glyph when the
/// pillar resolved no merchant at all.
///
/// Initials rather than a logo because this app has nowhere to read a brand
/// mark from — the same reason `InstitutionMark` gives for accounts, and the
/// same palette, so a purchase and an account mark the same way.
internal struct PurchaseMark: View {
    internal let purchase: Purchase
    internal var size: CGFloat = 38

    internal var body: some View {
        Group {
            if PurchasesPresentation.isUnattributed(purchase) {
                Image(systemName: "questionmark")
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: size, height: size)
                    .background(
                        Color.popsSurface, in: .rect(cornerRadius: PopsRadius.control)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: PopsRadius.control)
                            .strokeBorder(
                                Color.popsSeparator,
                                style: StrokeStyle(
                                    lineWidth: PopsBorder.hairline, dash: [PopsSpacing.xs])
                            )
                    )
            } else {
                Text(initials)
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsBackground)
                    .frame(width: size, height: size)
                    .background(
                        Self.tint(for: PurchasesPresentation.merchant(purchase)),
                        in: .rect(cornerRadius: PopsRadius.control)
                    )
            }
        }
        .accessibilityHidden(true)
    }

    private var initials: String {
        let words = PurchasesPresentation.merchant(purchase)
            .split(separator: " ")
            .filter { $0.first?.isLetter == true }
            .prefix(2)
        return words.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    /// Derived from the name's scalars rather than from `hashValue`, which
    /// Swift seeds per process — a mark whose colour changes when the app is
    /// relaunched is not an identity.
    private static func tint(for name: String) -> Color {
        let palette: [Color] = [.popsAccent, .popsWarning, .popsSuccess, .popsDestructive]
        let seed = name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) % 100_003 }
        return palette[seed % palette.count]
    }
}

/// The settlement status as a badge. Colour carries it, and a word repeats it,
/// because a state told only by a hue is a state a reader who cannot separate
/// those hues does not have.
internal struct PurchaseStatusBadge: View {
    internal let status: PurchaseSettlement

    internal var body: some View {
        let tone = PurchasesPresentation.tone(for: status)
        return Text(PurchasesPresentation.label(for: status))
            .font(.popsCaption)
            .fontWeight(.medium)
            .foregroundStyle(tone)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .background(tone.opacity(0.14), in: .rect(cornerRadius: PopsRadius.control))
            .lineLimit(1)
    }
}

/// A purchase at its smallest useful size: mark, name, day, amount.
///
/// Shared across the digest-finish variants because the row is not what those
/// variants disagree about — they disagree about what contains it. A row
/// redrawn three ways would put three changes in front of a reviewer asked to
/// judge one.
internal struct PurchaseCompactRow: View {
    internal let purchase: Purchase
    internal var markSize: CGFloat = 30

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            PurchaseMark(purchase: purchase, size: markSize)
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
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            """
            \(PurchasesPresentation.merchant(purchase)), \
            \(purchase.total.formatted()), \
            \(PurchasesPresentation.day(purchase))
            """
        )
    }
}

/// A section's name, set above what it introduces, with an optional note on
/// the right for the thing the section is qualified by — a currency, a count.
internal struct DigestSectionLabel: View {
    internal let title: String
    internal var note: String?

    internal var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            Text(title.uppercased())
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            Spacer(minLength: PopsSpacing.sm)
            if let note {
                Text(note)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}
