import AppCore
import Foundation

/// A saved purchase, in the conditions the archive actually holds.
@MainActor
internal enum PurchaseDetailSurfaces {
    private static let sheets: [Data] =
        ReceiptPlaygroundPaper
        .pages(ReceiptPart.maxPerReceipt)
        .map(\.data)

    private static func page(_ index: Int, _ label: String) -> StagedPage {
        StagedPage(
            id: "dp-\(index)",
            label: label,
            media: .jpeg,
            bytes: sheets.isEmpty ? nil : sheets[index % sheets.count]
        )
    }

    private static func line(
        _ id: String, _ name: String, _ quantity: Int, _ cents: Int
    ) -> PurchaseDetailLine {
        PurchaseDetailLine(
            id: id, name: name, quantity: quantity, lineTotal: Fixtures.money(cents))
    }

    private static func detail(
        _ purchase: Purchase,
        subtotal: Int,
        tax: Int = 0,
        shipping: Int = 0,
        discount: Int = 0,
        surcharge: Int = 0,
        source: String = "pops://purchases/receipt/upload",
        lines: [PurchaseDetailLine],
        pages: Int = 1
    ) -> PurchaseDetail {
        PurchaseDetail(
            purchase: purchase,
            subtotal: Fixtures.money(subtotal),
            tax: Fixtures.money(tax),
            shipping: Fixtures.money(shipping),
            discount: Fixtures.money(discount),
            surcharge: Fixtures.money(surcharge),
            source: source,
            lines: lines,
            pages: (0..<pages).map { page($0, "Page \($0 + 1)") }
        )
    }

    private static func fixture(_ id: String) -> Purchase {
        PurchasesFixtures.history.first { $0.id == id } ?? PurchasesFixtures.history[0]
    }

    internal static let surface = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "detail"),
        title: "Purchase",
        synopsis:
            "A saved purchase, its receipt, its lines and what the route can say about money.",
        chrome: .navigation,
        states: [
            DesignState.standard {
                PurchaseDetailSurface(
                    detail: detail(
                        fixture("pur-bunnings"),
                        subtotal: 14_200,
                        tax: 1_400,
                        lines: [
                            line("l1", "OZITO 18V CORDLESS DRILL DRIVER KIT", 1, 9_900),
                            line("l2", "BUGLE BATTEN SCREW 14G X 75MM 25PK", 2, 2_850),
                            line("l3", "SELLEYS NO MORE GAPS 475G", 1, 1_450),
                        ],
                        pages: 2))
            },
            // The real corpus: a Salvos receipt whose lines are the same OCR
            // string seven times over, with newlines in them. A detail screen
            // designed against tidy product names has not met this data.
            DesignState("till-names", "Lines as the till printed them") {
                PurchaseDetailSurface(
                    detail: detail(
                        fixture("pur-salvos"),
                        subtotal: 6_600,
                        lines: [
                            line("l1", "3129-1-PP\nC&H Fruits Drops*", 1, 500),
                            line(
                                "l2",
                                "YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open",
                                2, 600),
                            line(
                                "l3",
                                "YUA001\nLiving / Home Decor - Living / Home Decor\nPrice: open",
                                1, 1_200),
                            line("l4", "3000-1-PP\nReusable Bag Regular*\nSIZE: Regular", 1, 100),
                        ]))
            },
            // Everything the five figures can carry at once, which only an
            // online order does.
            DesignState("every-figure", "Tax, delivery, discount and surcharge") {
                PurchaseDetailSurface(
                    detail: detail(
                        fixture("pur-returned"),
                        subtotal: 8_990,
                        tax: 817,
                        shipping: 795,
                        discount: 1_000,
                        surcharge: 150,
                        source: "pops://purchases/uniqlo/order",
                        lines: [
                            line("l1", "HEATTECH SOCKS 3P", 2, 1_990),
                            line("l2", "AIRISM CREW NECK T", 1, 7_000),
                        ],
                        pages: 0))
            },
            // A receipt that was legible and simply itemised nothing. Not the
            // same as one nobody could read, and it must not look like a
            // screen that failed to load.
            DesignState("no-lines", "A receipt with no itemised lines") {
                PurchaseDetailSurface(
                    detail: detail(fixture("pur-coffee"), subtotal: 540, lines: []))
            },
            DesignState("unattributed", "No merchant was recognised") {
                PurchaseDetailSurface(
                    detail: detail(
                        fixture("pur-unattributed"),
                        subtotal: 2_280,
                        lines: [line("l1", "ITEM", 1, 2_280)]))
            },
            // Paid in cash, so no transaction will ever explain it. A settled
            // answer rather than a pending one, which the badge has to say.
            DesignState("cash", "Settled in cash, no receipt") {
                PurchaseDetailSurface(
                    detail: detail(
                        fixture("pur-coffee"),
                        subtotal: 540,
                        lines: [line("l1", "Flat white", 1, 540)],
                        pages: 0))
            },
            DesignState("foreign", "Priced in another currency") {
                PurchaseDetailSurface(
                    detail: PurchaseDetail(
                        purchase: fixture("pur-storage"),
                        subtotal: Fixtures.money(1_100, "USD"),
                        tax: Fixtures.money(0, "USD"),
                        shipping: Fixtures.money(0, "USD"),
                        discount: Fixtures.money(0, "USD"),
                        surcharge: Fixtures.money(0, "USD"),
                        source: "pops://purchases/backblaze/invoice",
                        lines: [
                            PurchaseDetailLine(
                                id: "l1", name: "B2 Cloud Storage", quantity: 1,
                                lineTotal: Fixtures.money(1_100, "USD"))
                        ],
                        pages: []))
            },
        ]
    )
}
