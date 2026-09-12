import AppCore
import Foundation

/// Fictional purchases, typed against ``Purchase``, and shaped like what the
/// pillar actually holds rather than like a catalogue.
///
/// The real corpus is five receipt uploads, every one of them
/// `awaiting_settlement`, with merchant names straight off a till — `K mart`,
/// `TONGLI SUPERMARKET`, `ALDI STORES` — and two of the five resolving to no
/// merchant entity at all. A fixture set of `Woolworths Metro` and
/// `Bunnings Warehouse` designs a screen for data nobody has.
///
/// So these are deliberately awkward: shouted names, a name long enough to
/// truncate at every Dynamic Type size, a row the pillar could not attribute,
/// one purchase priced in a currency that is not the rest, and a status this
/// build has never heard of. Each of those is a row that breaks a layout, and
/// a variant that only looks right without them is one that has not been
/// reviewed.
internal enum PurchasesFixtures {
    /// 2026-09-12, the day this set was written. Every row is placed relative
    /// to it so the months keep their boundaries and the newest row stays
    /// newest, rather than the set ageing into one undifferentiated block.
    private static let reference = Date(timeIntervalSince1970: 1_789_257_600)

    private static func daysAgo(_ days: Int) -> Date {
        reference.addingTimeInterval(TimeInterval(-days * 86_400))
    }

    private static func purchase(
        _ id: String,
        _ merchantName: String?,
        daysAgo days: Int,
        _ cents: Int,
        items: Int,
        status: PurchaseSettlement,
        currency: String = Fixtures.aud,
        receipt: Bool = true
    ) -> Purchase {
        Purchase(
            id: id,
            merchantName: merchantName,
            orderedOn: daysAgo(days),
            total: Fixtures.money(cents, currency),
            itemCount: items,
            receiptURI: receipt ? "pops://purchases/receipt/\(id)" : nil,
            status: status
        )
    }

    /// The five the playground shipped with, kept because
    /// ``PurchasesSurfaces`` reviews the list's own states against them and a
    /// short set is easier to reason about than a long one.
    static let all: [Purchase] = Array(history.prefix(5))

    /// A history long enough to scroll, spanning three calendar months so a
    /// variant that groups by month has more than one group to draw.
    static let history: [Purchase] = [
        purchase(
            "pur-sushi", "Monster Sushi Bar Barrack Place",
            daysAgo: 1, 1_609, items: 1, status: .awaitingSettlement),
        purchase(
            "pur-tongli", "TONGLI SUPERMARKET",
            daysAgo: 3, 4_376, items: 5, status: .awaitingSettlement),
        purchase(
            "pur-unattributed", nil,
            daysAgo: 4, 2_280, items: 2, status: .awaitingSettlement),
        purchase(
            "pur-aldi", "ALDI STORES",
            daysAgo: 8, 802, items: 1, status: .linked),
        purchase(
            "pur-chemist", "CHEMIST WAREHOUSE BROADWAY",
            daysAgo: 11, 3_495, items: 4, status: .partial),
        purchase(
            "pur-salvos", "Salvos Stores",
            daysAgo: 16, 6_600, items: 10, status: .awaitingSettlement),
        purchase(
            "pur-kmart", "K mart",
            daysAgo: 19, 3_000, items: 3, status: .linked),
        purchase(
            "pur-coffee", "SAMPLE COFFEE SURRY HILLS",
            daysAgo: 22, 540, items: 1, status: .settledCash, receipt: false),
        purchase(
            "pur-woolworths", "WOOLWORTHS METRO TOWN HALL 3182",
            daysAgo: 27, 11_847, items: 23, status: .awaitingSettlement),
        // Priced in a currency none of the others are. A screen that shows one
        // figure for a month has to decide what this row does to it, and the
        // analytics endpoint's own answer is that no cross-currency total
        // exists — so a variant that quietly adds it in is wrong rather than
        // approximate.
        purchase(
            "pur-storage", "BACKBLAZE INC",
            daysAgo: 31, 1_100, items: 1, status: .linked, currency: "USD",
            receipt: false),
        purchase(
            "pur-bunnings", "BUNNINGS WAREHOUSE ALEXANDRIA",
            daysAgo: 38, 15_600, items: 7, status: .awaitingSettlement),
        // A status added to the pillar after this build shipped. It draws as
        // itself rather than as a mismatch, which is the whole point of
        // ``PurchaseSettlement/unrecognised``.
        purchase(
            "pur-returned", "UNIQLO AUSTRALIA PITT ST",
            daysAgo: 44, 7_990, items: 2, status: .unrecognised("refunded")),
        purchase(
            "pur-ignored", "TRANSPORTFORNSW TAP ON",
            daysAgo: 52, 452, items: 1, status: .ignored, receipt: false),
        purchase(
            "pur-market", "EVELEIGH FARMERS MARKET STALL 12",
            daysAgo: 58, 4_150, items: 6, status: .awaitingSettlement),
    ]

    /// Only the rows still waiting on somebody — what a status-led variant
    /// pins above the fold.
    static var unsettled: [Purchase] { history.filter(\.status.isUnsettled) }
}
