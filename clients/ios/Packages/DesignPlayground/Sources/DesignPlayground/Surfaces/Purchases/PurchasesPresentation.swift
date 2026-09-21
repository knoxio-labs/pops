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
    /// What to call the merchant.
    ///
    /// A resolved purchase answers with the contacts entity's name —
    /// `Bunnings`, not `BUNNINGS WAREHOUSE ALEXANDRIA`. One that resolved to
    /// nothing answers with what the till printed, as printed: there is no
    /// tidier name to show, and title-casing it here would be a screen having
    /// an opinion about a label the pillar is searched by.
    static func merchant(_ purchase: Purchase) -> String {
        purchase.merchant.displayName ?? "Merchant not recognised"
    }

    static func isUnattributed(_ purchase: Purchase) -> Bool {
        purchase.merchant == .unattributed
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
