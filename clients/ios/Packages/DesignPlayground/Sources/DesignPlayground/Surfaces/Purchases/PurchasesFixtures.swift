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
///
/// The merchants are split the way the pillar splits them. The resolved ones
/// carry both names — `Bunnings` from contacts and
/// `BUNNINGS WAREHOUSE ALEXANDRIA` from the till — because that is the pair a
/// resolved purchase actually holds. The rest carry only what was printed,
/// and are shown that way rather than tidied. Note that the phone cannot tell
/// these apart today: `GET /mobile/purchases` sends one nullable string, so
/// every row a live device draws is a `printed` one (POPS-3634). These
/// fixtures describe the data, not the wire.
internal enum PurchasesFixtures {
    /// 2026-09-12, the day this set was written. Every row is placed relative
    /// to it so the months keep their boundaries and the newest row stays
    /// newest, rather than the set ageing into one undifferentiated block.
    private static let reference = Date(timeIntervalSince1970: 1_789_257_600)

    private static func daysAgo(_ days: Int) -> Date {
        reference.addingTimeInterval(TimeInterval(-days * 86_400))
    }

    /// `status` defaults to ``PurchaseSettlement/awaitingSettlement`` because
    /// that is what every purchase the pillar actually holds is — a row that
    /// is settled is the exception here, and saying so at the exceptions is
    /// shorter and truer than repeating it fourteen times.
    private static func purchase(
        _ id: String,
        _ merchant: MerchantIdentity,
        daysAgo days: Int,
        _ total: MoneyAmount,
        items: Int,
        status: PurchaseSettlement = .awaitingSettlement,
        receipt: Bool = true
    ) -> Purchase {
        Purchase(
            id: id,
            merchant: merchant,
            orderedOn: daysAgo(days),
            total: total,
            itemCount: items,
            receiptURI: receipt ? "pops://purchases/receipt/\(id)" : nil,
            status: status
        )
    }

    private static func aud(_ cents: Int) -> MoneyAmount { Fixtures.money(cents) }

    /// The five the playground shipped with, kept because
    /// ``PurchasesSurfaces`` reviews the list's own states against them and a
    /// short set is easier to reason about than a long one.
    static let all: [Purchase] = Array(history.prefix(5))

    /// A history long enough to scroll, spanning three calendar months so a
    /// variant that groups by month has more than one group to draw.
    static let history: [Purchase] = [
        purchase(
            "pur-sushi",
            .entity(
                id: "ent-sushi", name: "Monster Sushi", printed: "Monster Sushi Bar Barrack Place"),
            daysAgo: 1, aud(1_609), items: 1),
        purchase(
            "pur-tongli", .printed("TONGLI SUPERMARKET"),
            daysAgo: 3, aud(4_376), items: 5),
        purchase(
            "pur-unattributed", .unattributed,
            daysAgo: 4, aud(2_280), items: 2),
        purchase(
            "pur-aldi", .entity(id: "ent-aldi", name: "ALDI", printed: "ALDI STORES"),
            daysAgo: 8, aud(802), items: 1, status: .linked),
        purchase(
            "pur-chemist",
            .entity(
                id: "ent-chemist", name: "Chemist Warehouse", printed: "CHEMIST WAREHOUSE BROADWAY"),
            daysAgo: 11, aud(3_495), items: 4, status: .partial),
        purchase(
            "pur-salvos", .printed("Salvos Stores"),
            daysAgo: 16, aud(6_600), items: 10),
        purchase(
            "pur-kmart", .entity(id: "ent-kmart", name: "Kmart", printed: "K mart"),
            daysAgo: 19, aud(3_000), items: 3, status: .linked),
        purchase(
            "pur-coffee", .printed("SAMPLE COFFEE SURRY HILLS"),
            daysAgo: 22, aud(540), items: 1, status: .settledCash, receipt: false),
        purchase(
            "pur-woolworths",
            .entity(
                id: "ent-woolworths", name: "Woolworths", printed: "WOOLWORTHS METRO TOWN HALL 3182"
            ),
            daysAgo: 27, aud(11_847), items: 23),
        // Priced in a currency none of the others are. A screen that shows one
        // figure for a month has to decide what this row does to it, and the
        // analytics endpoint's own answer is that no cross-currency total
        // exists — so a variant that quietly adds it in is wrong rather than
        // approximate.
        purchase(
            "pur-storage",
            .entity(id: "ent-backblaze", name: "Backblaze", printed: "BACKBLAZE INC"),
            daysAgo: 31, Fixtures.money(1_100, "USD"), items: 1, status: .linked,
            receipt: false),
        purchase(
            "pur-bunnings",
            .entity(id: "ent-bunnings", name: "Bunnings", printed: "BUNNINGS WAREHOUSE ALEXANDRIA"),
            daysAgo: 38, aud(15_600), items: 7),
        // A status added to the pillar after this build shipped. It draws as
        // itself rather than as a mismatch, which is the whole point of
        // ``PurchaseSettlement/unrecognised``.
        purchase(
            "pur-returned",
            .entity(id: "ent-uniqlo", name: "Uniqlo", printed: "UNIQLO AUSTRALIA PITT ST"),
            daysAgo: 44, aud(7_990), items: 2, status: .unrecognised("refunded")),
        purchase(
            "pur-ignored", .printed("TRANSPORTFORNSW TAP ON"),
            daysAgo: 52, aud(452), items: 1, status: .ignored, receipt: false),
        purchase(
            "pur-market", .printed("EVELEIGH FARMERS MARKET STALL 12"),
            daysAgo: 58, aud(4_150), items: 6),
    ]
}
