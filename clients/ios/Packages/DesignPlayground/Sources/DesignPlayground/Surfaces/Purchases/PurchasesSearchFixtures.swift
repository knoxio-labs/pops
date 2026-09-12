import AppCore

/// One line item a search matched, and the purchase it belongs to.
///
/// The purchases pillar's `POST /search` answers on two levels — an order,
/// matched on merchant name or order id, and a line, matched on product name
/// or SKU, each line carrying the id of the order it came from. This is the
/// second of those, which is the half the phone has no shape for otherwise:
/// `Purchase` is a list row and carries no items.
internal struct PurchaseItemHit: Identifiable, Hashable {
    internal let id: String
    internal let purchaseID: String
    internal let name: String
    internal let quantity: Int
    internal let lineTotal: MoneyAmount
    /// Tags the classification pass proposed or a person asserted. Empty for
    /// most real lines — see ``PurchasesSearchFixtures``.
    internal let tags: [String]
}

/// What a search over the purchase history would match, if the phone could ask.
///
/// It cannot: `GET /mobile/purchases` takes a limit and a cursor, and bfm
/// proxies none of the pillar's `POST /search`. So this is a fixture in the
/// strongest sense — it describes a response no device has ever received, and
/// the screen built on it is a design for POPS-3638 rather than a rendering of
/// something live.
///
/// The item names are what the real corpus holds, which is the point of them:
/// `3129-1-PP\nC&H Fruits Drops*` is one line off one Salvos receipt, newline
/// and all, and seven of that receipt's ten lines are the identical string
/// `YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open`. A search
/// results list designed against tidy product names is a list that has not met
/// this data.
///
/// Tags are sparse on purpose. Every `purchase_item_tags` row in production is
/// currently absent, so a tag-led search finds nothing today; the few here are
/// what the classification pass would propose, and they carry the
/// proposed-versus-asserted distinction the pillar draws by being listed at
/// all rather than by being decorated.
internal enum PurchasesSearchFixtures {
    static let items: [PurchaseItemHit] = [
        PurchaseItemHit(
            id: "itm-drill", purchaseID: "pur-bunnings",
            name: "OZITO 18V CORDLESS DRILL DRIVER KIT",
            quantity: 1, lineTotal: Fixtures.money(9_900), tags: ["tool"]),
        PurchaseItemHit(
            id: "itm-screws", purchaseID: "pur-bunnings",
            name: "BUGLE BATTEN SCREW 14G X 75MM 25PK",
            quantity: 2, lineTotal: Fixtures.money(2_850), tags: ["hardware"]),
        PurchaseItemHit(
            id: "itm-drops", purchaseID: "pur-salvos",
            name: "3129-1-PP\nC&H Fruits Drops*",
            quantity: 1, lineTotal: Fixtures.money(500), tags: []),
        PurchaseItemHit(
            id: "itm-decor", purchaseID: "pur-salvos",
            name: "YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open",
            quantity: 2, lineTotal: Fixtures.money(600), tags: []),
        PurchaseItemHit(
            id: "itm-bag", purchaseID: "pur-salvos",
            name: "3000-1-PP\nReusable Bag Regular*\nSIZE: Regular",
            quantity: 1, lineTotal: Fixtures.money(100), tags: []),
        PurchaseItemHit(
            id: "itm-milk", purchaseID: "pur-woolworths",
            name: "WW FULL CREAM MILK 2L",
            quantity: 2, lineTotal: Fixtures.money(672), tags: ["grocery", "dairy"]),
        PurchaseItemHit(
            id: "itm-berries", purchaseID: "pur-woolworths",
            name: "DRISCOLLS BLUEBERRIES 125G",
            quantity: 1, lineTotal: Fixtures.money(550), tags: ["grocery", "fruit"]),
        PurchaseItemHit(
            id: "itm-noodles", purchaseID: "pur-tongli",
            name: "SHOU DAO HAND PULLED NOODLE 1KG",
            quantity: 1, lineTotal: Fixtures.money(890), tags: ["grocery"]),
        PurchaseItemHit(
            id: "itm-sauce", purchaseID: "pur-tongli",
            name: "LEE KUM KEE CHIU CHOW CHILLI OIL",
            quantity: 1, lineTotal: Fixtures.money(680), tags: ["grocery"]),
        PurchaseItemHit(
            id: "itm-socks", purchaseID: "pur-returned",
            name: "HEATTECH SOCKS 3P",
            quantity: 2, lineTotal: Fixtures.money(1_990), tags: ["clothing"]),
        PurchaseItemHit(
            id: "itm-panadol", purchaseID: "pur-chemist",
            name: "PANADOL OSTEO 96 TABLETS",
            quantity: 1, lineTotal: Fixtures.money(1_699), tags: ["pharmacy"]),
    ]

    /// Every tag any line carries, most-used first, for the state where the
    /// field is focused and nothing has been typed.
    static var tags: [String] {
        var counts: [String: Int] = [:]
        for item in items {
            for tag in item.tags { counts[tag, default: 0] += 1 }
        }
        return counts.sorted { ($0.value, $1.key) > ($1.value, $0.key) }.map(\.key)
    }
}
