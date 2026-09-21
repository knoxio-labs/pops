import AppCore
import Foundation

/// One line item a search matched, and the purchase it belongs to.
///
/// The purchases pillar's `POST /search` answers on two levels: an order,
/// matched on its merchant, and a line, matched on product name or tag, each
/// line carrying the id of the order it came from. `Purchase` is a list row
/// and carries no items, so this is the phone's shape for the second.
internal struct PurchaseItemHit: Identifiable, Hashable {
    internal let id: String
    internal let purchaseID: String
    internal let name: String
    internal let quantity: Int
    internal let lineTotal: MoneyAmount
    /// Tags the classification pass proposed or a person asserted. Empty for
    /// most real lines.
    internal let tags: [String]
}

/// What a search over the purchase history would match, if the phone could
/// ask. It cannot yet: `GET /mobile/purchases` takes a limit and a cursor,
/// and bfm proxies none of the pillar's `POST /search`, so this describes a
/// response no device has received.
///
/// The item names are what the real corpus holds, newlines and all: seven of
/// one Salvos receipt's ten lines are the identical string
/// `YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open`. A results
/// list designed against tidy product names has not met this data. Tags are
/// sparse because real lines rarely carry one.
///
/// Search reaches further back than the list's first page, so one purchase
/// here, Total Tools, is older than anything `PurchasesFixtures.history`
/// shows.
internal enum PurchasesSearchFixtures {
    internal static let purchases: [Purchase] = PurchasesFixtures.history + [totalTools]

    private static let totalTools = Purchase(
        id: "pur-totaltools",
        merchant: .entity(
            id: "ent-totaltools", name: "Total Tools", printed: "TOTAL TOOLS ST PETERS"),
        orderedOn: PurchasesFixtures.reference.addingTimeInterval(-63 * 86_400),
        total: Fixtures.money(24_900),
        itemCount: 2,
        receiptURI: "pops://purchases/receipt/pur-totaltools",
        status: .linked)

    internal static let items: [PurchaseItemHit] = [
        line("itm-drill", "pur-bunnings", "OZITO 18V CORDLESS DRILL DRIVER KIT", 1, 9_900, ["tool"]),
        line("itm-screws", "pur-bunnings", "BUGLE BATTEN SCREW 14G X 75MM 25PK", 2, 2_850, ["hardware"]),
        line("itm-drops", "pur-salvos", "3129-1-PP\nC&H Fruits Drops*", 1, 500),
        line(
            "itm-decor", "pur-salvos",
            "YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open", 2, 600),
        line("itm-bag", "pur-salvos", "3000-1-PP\nReusable Bag Regular*\nSIZE: Regular", 1, 100),
        line("itm-milk", "pur-woolworths", "WW FULL CREAM MILK 2L", 2, 672, ["grocery", "dairy"]),
        line("itm-eggs", "pur-woolworths", "WOOLWORTHS FREE RANGE EGGS 12PK", 1, 750, ["grocery"]),
        line("itm-berries", "pur-woolworths", "DRISCOLLS BLUEBERRIES 125G", 1, 550, ["grocery", "fruit"]),
        line("itm-noodles", "pur-tongli", "SHOU DAO HAND PULLED NOODLE 1KG", 1, 890, ["grocery"]),
        line("itm-sauce", "pur-tongli", "LEE KUM KEE CHIU CHOW CHILLI OIL", 1, 680, ["grocery"]),
        line("itm-lamp", "pur-kmart", "ANKO LED DESK LAMP", 1, 1_500, ["lighting"]),
        line("itm-socks", "pur-returned", "HEATTECH SOCKS 3P", 2, 1_990, ["clothing"]),
        line("itm-panadol", "pur-chemist", "PANADOL OSTEO 96 TABLETS", 1, 1_699, ["pharmacy"]),
        line("itm-impact", "pur-totaltools", "MAKITA 18V IMPACT DRIVER SKIN", 1, 17_900, ["tool"]),
        line("itm-tape", "pur-totaltools", "STANLEY FATMAX TAPE 8M", 1, 7_000, ["tool"]),
    ]

    internal static func purchase(id: String) -> Purchase? {
        purchases.first { $0.id == id }
    }

    private static func line(
        _ id: String, _ purchaseID: String, _ name: String, _ quantity: Int, _ cents: Int,
        _ tags: [String] = []
    ) -> PurchaseItemHit {
        PurchaseItemHit(
            id: id, purchaseID: purchaseID, name: name, quantity: quantity,
            lineTotal: Fixtures.money(cents), tags: tags)
    }
}
