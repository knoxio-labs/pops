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
