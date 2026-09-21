import AppCore
import Foundation

/// Saved purchases for the detail, shaped like what the archive holds.
@MainActor
internal enum PurchaseDetailFixtures {
    private static let sheets: [Data] =
        ReceiptPlaygroundPaper
        .pages(ReceiptPart.maxPerReceipt)
        .map(\.data)

    /// When the edited fixtures were changed: two days after the history's
    /// reference date.
    private static let editedOn = Date(timeIntervalSince1970: 1_789_430_400)

    static func page(_ index: Int) -> StagedPage {
        StagedPage(
            id: "dp-\(index)",
            label: "Page \(index + 1)",
            media: .jpeg,
            bytes: sheets.isEmpty ? nil : sheets[index % sheets.count]
        )
    }

    private static func line(
        _ id: String, _ name: String, _ quantity: Int, _ cents: Int, _ currency: String = "AUD"
    ) -> PurchaseDetailLine {
        PurchaseDetailLine(
            id: id, name: name, quantity: quantity, lineTotal: Fixtures.money(cents, currency))
    }

    private static func purchase(_ id: String) -> Purchase {
        PurchasesFixtures.history.first { $0.id == id } ?? PurchasesFixtures.history[0]
    }

    private struct Figures {
        var subtotal: Int
        var tax = 0
        var shipping = 0
        var discount = 0
        var surcharge = 0
    }

    private static func detail(
        _ id: String,
        _ figures: Figures,
        source: String = "pops://purchases/receipt/upload",
        lines: [PurchaseDetailLine],
        pages: Int = 1
    ) -> PurchaseDetail {
        let purchase = purchase(id)
        let currency = purchase.total.currencyCode
        return PurchaseDetail(
            purchase: purchase,
            subtotal: Fixtures.money(figures.subtotal, currency),
            tax: Fixtures.money(figures.tax, currency),
            shipping: Fixtures.money(figures.shipping, currency),
            discount: Fixtures.money(figures.discount, currency),
            surcharge: Fixtures.money(figures.surcharge, currency),
            source: source,
            lines: lines,
            pages: (0..<pages).map(page)
        )
    }

    private static func edited(_ detail: PurchaseDetail, _ changes: [PurchaseFieldChange])
        -> PurchaseDetail
    {
        var edited = detail
        edited.edit = PurchaseEdit(editedOn: editedOn, changes: changes)
        return edited
    }

    private static let bunningsLines = [
        line("l1", "OZITO 18V CORDLESS DRILL DRIVER KIT", 1, 9_900),
        line("l2", "BUGLE BATTEN SCREW 14G X 75MM 25PK", 2, 2_850),
        line("l3", "SELLEYS NO MORE GAPS 475G", 1, 1_450),
    ]

    static let bunnings = detail(
        "pur-bunnings", Figures(subtotal: 14_200, tax: 1_400), lines: bunningsLines, pages: 2)

    /// Bunnings once its till names were rewritten as a person says them.
    static let bunningsEdited = edited(
        detail(
            "pur-bunnings", Figures(subtotal: 14_200, tax: 1_400),
            lines: [
                line("l1", "Cordless drill kit", 1, 9_900),
                line("l2", "Batten screws 75mm", 2, 2_850),
                line("l3", "Gap filler", 1, 1_450),
            ],
            pages: 2),
        [
            PurchaseFieldChange(
                id: "l1", field: "Item 1", original: bunningsLines[0].name,
                current: "Cordless drill kit"),
            PurchaseFieldChange(
                id: "l2", field: "Item 2", original: bunningsLines[1].name,
                current: "Batten screws 75mm"),
            PurchaseFieldChange(
                id: "l3", field: "Item 3", original: bunningsLines[2].name, current: "Gap filler"),
        ])

    private static let aldiLines = [line("l1", "BANANAS CAVENDISH KG", 1, 802)]

    /// Matched to a bank transaction, so merchant, date and total are held.
    static let aldi = detail("pur-aldi", Figures(subtotal: 802), lines: aldiLines)

    static let aldiEdited = edited(
        detail("pur-aldi", Figures(subtotal: 802), lines: [line("l1", "Bananas", 1, 802)]),
        [
            PurchaseFieldChange(
                id: "l1", field: "Item 1", original: aldiLines[0].name, current: "Bananas")
        ])

    /// The real corpus: lines that are the same OCR string over and over,
    /// with newlines in them.
    static let salvos = detail(
        "pur-salvos", Figures(subtotal: 6_600),
        lines: [
            line("l1", "3129-1-PP\nC&H Fruits Drops*", 1, 500),
            line("l2", "YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open", 2, 600),
            line("l3", "YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open", 1, 1_200),
            line("l4", "3000-1-PP\nReusable Bag Regular*\nSIZE: Regular", 1, 100),
            line("l5", "YUA002\nKitchenware - Kitchenware\nPrice: open", 3, 1_500),
            line("l6", "YUA003\nBooks - Books\nPrice: open", 4, 1_200),
            line("l7", "YUA004\nClothing - Mens\nPrice: open", 1, 800),
            line("l8", "YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open", 1, 700),
        ])

    /// Every figure an online order can carry, and a status this build has
    /// never heard of. The figures reconcile to the history's $79.90, because
    /// the detail prints them as a receipt's foot and a foot that does not add
    /// up reads as a bug.
    static let uniqlo = detail(
        "pur-returned",
        Figures(subtotal: 8_480, tax: 595, shipping: 795, discount: 2_000, surcharge: 120),
        source: "pops://purchases/uniqlo/order",
        lines: [
            line("l1", "HEATTECH SOCKS 3P", 2, 1_990),
            line("l2", "AIRISM COTTON OVERSIZED CREW NECK T-SHIRT", 1, 6_490),
        ],
        pages: 0)

    static let sushiNoLines = detail("pur-sushi", Figures(subtotal: 1_609), lines: [])

    static let unattributed = detail(
        "pur-unattributed", Figures(subtotal: 2_280), lines: [line("l1", "ITEM", 1, 2_280)])

    static let cash = detail(
        "pur-coffee", Figures(subtotal: 540), lines: [line("l1", "Flat white", 1, 540)], pages: 0)

    static let foreign = detail(
        "pur-storage", Figures(subtotal: 1_100), source: "pops://purchases/backblaze/invoice",
        lines: [line("l1", "B2 Cloud Storage", 1, 1_100, "USD")], pages: 0)
}
