import AppCore
import SwiftUI

/// The capture flow, from what was picked to what was read.
///
/// The flow decided on 2026-09-12: the capture control offers four inputs —
/// the camera, the photo library, a file, and nothing at all — and every one
/// of them lands on the same pre-filled form, which is saved, and the save is
/// what ingests. The camera and the two pickers are system UI and are not
/// designed here; what is designed is what happens either side of them.
///
/// The form itself is not restaged. `receipts/draft` already reviews it, and
/// POPS-2455 was cancelled precisely so there would be one form rather than a
/// receipt-filled one and a manual one that drift apart.
@MainActor
internal enum PurchaseCaptureSurfaces {
    internal static let surfaces: [DesignSurface] = [staging, reading]

    private static func page(_ index: Int, _ label: String, media: ReceiptMediaType = .jpeg)
        -> StagedPage
    {
        StagedPage(
            id: "pg-\(index)",
            label: label,
            media: media,
            bytes: media == .pdf || media == .plainText ? nil : paper(index)
        )
    }

    private static let sheets: [Data] =
        ReceiptPlaygroundPaper
        .pages(ReceiptPart.maxPerReceipt)
        .map(\.data)

    private static func paper(_ index: Int) -> Data? {
        sheets.isEmpty ? nil : sheets[index % sheets.count]
    }

    private static func receipt(_ id: String, _ pages: [StagedPage]) -> StagedReceipt {
        StagedReceipt(id: id, pages: pages)
    }

    static let staging = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "staging"),
        title: "Staging",
        synopsis:
            "What was picked, as a grid. Drag one onto another to make them one receipt.",
        chrome: .navigation,
        states: [
            DesignState.standard {
                PurchaseStagingGrid(receipts: [
                    receipt("r1", [page(0, "IMG_4821.HEIC")]),
                    receipt("r2", [page(1, "IMG_4822.HEIC")]),
                    receipt("r3", [page(2, "IMG_4823.HEIC")]),
                    receipt("r4", [page(3, "IMG_4824.HEIC")]),
                ])
            },
            DesignState("single", "One photograph") {
                PurchaseStagingGrid(receipts: [receipt("r1", [page(0, "IMG_4821.HEIC")])])
            },
            // What the camera produces: a scan is already one receipt, so this
            // is the state a person reaches without ever touching Combine.
            DesignState("scan", "A three-page scan") {
                PurchaseStagingGrid(receipts: [
                    receipt(
                        "r1",
                        [
                            page(0, "Scan page 1"), page(1, "Scan page 2"),
                            page(2, "Scan page 3"),
                        ])
                ])
            },
            DesignState("combined", "One grouped, one not") {
                PurchaseStagingGrid(receipts: [
                    receipt("r1", [page(0, "IMG_4821.HEIC"), page(1, "IMG_4822.HEIC")]),
                    receipt("r2", [page(2, "IMG_4823.HEIC")]),
                ])
            },
            DesignState("mixed", "A file among the photographs") {
                PurchaseStagingGrid(receipts: [
                    receipt("r1", [page(0, "IMG_4821.HEIC")]),
                    receipt("r2", [page(1, "tax-invoice-8841.pdf", media: .pdf)]),
                    receipt("r3", [page(2, "order-confirmation.txt", media: .plainText)]),
                ])
            },
        ]
    )

    static let reading = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "reading"),
        title: "Reading",
        synopsis: "Each staged receipt reporting what the model made of it, as it lands.",
        chrome: .navigation,
        states: [
            // The state the screen exists for: some done, one in flight, one
            // still waiting, and a result already readable on the finished
            // rows.
            DesignState.standard {
                PurchaseProcessingSurface(readings: [
                    reading(
                        "k1", [page(0, "IMG_4821.HEIC")],
                        .read(
                            merchant: "Bunnings", total: Fixtures.money(15_600), lines: 7)),
                    reading(
                        "k2", [page(1, "IMG_4822.HEIC")],
                        .read(
                            merchant: "Woolworths", total: Fixtures.money(11_847), lines: 23)),
                    reading("k3", [page(2, "IMG_4823.HEIC")], .reading),
                    reading("k4", [page(3, "IMG_4824.HEIC")], .queued),
                ])
            },
            DesignState("single", "One receipt, in flight") {
                PurchaseProcessingSurface(readings: [
                    reading(
                        "k1",
                        [page(0, "Scan page 1"), page(1, "Scan page 2"), page(2, "Scan page 3")],
                        .reading)
                ])
            },
            DesignState("starting", "Nothing done yet") {
                PurchaseProcessingSurface(readings: [
                    reading("k1", [page(0, "IMG_4821.HEIC")], .reading),
                    reading("k2", [page(1, "IMG_4822.HEIC")], .queued),
                    reading("k3", [page(2, "IMG_4823.HEIC")], .queued),
                ])
            },
            // One unreadable among successes. It does not stop the others and
            // does not leave the batch — it goes to the review step with
            // nothing filled in.
            DesignState("one-unreadable", "One could not be read") {
                PurchaseProcessingSurface(readings: [
                    reading(
                        "k1", [page(0, "IMG_4821.HEIC")],
                        .read(
                            merchant: "Bunnings", total: Fixtures.money(15_600), lines: 7)),
                    reading(
                        "k2", [page(1, "IMG_4822.HEIC")],
                        .unreadable(
                            reason: "The total could not be found on the page.")),
                    reading(
                        "k3", [page(2, "IMG_4823.HEIC")],
                        .read(
                            merchant: "ALDI", total: Fixtures.money(802), lines: 1)),
                ])
            },
            DesignState("finished", "All read") {
                PurchaseProcessingSurface(readings: [
                    reading(
                        "k1", [page(0, "IMG_4821.HEIC")],
                        .read(
                            merchant: "Bunnings", total: Fixtures.money(15_600), lines: 7)),
                    reading(
                        "k2", [page(1, "IMG_4822.HEIC")],
                        .read(
                            merchant: "Woolworths", total: Fixtures.money(11_847), lines: 23)),
                    reading(
                        "k3", [page(2, "IMG_4823.HEIC")],
                        .read(
                            merchant: "Monster Sushi", total: Fixtures.money(1_609), lines: 1)),
                ])
            },
            DesignState("all-unreadable", "None could be read") {
                PurchaseProcessingSurface(readings: [
                    reading(
                        "k1", [page(0, "IMG_4821.HEIC")],
                        .unreadable(
                            reason: "The page is too blurred to read.")),
                    reading(
                        "k2", [page(1, "IMG_4822.HEIC")],
                        .unreadable(
                            reason: "The total could not be found on the page.")),
                ])
            },
        ]
    )

    private static func reading(
        _ id: String, _ pages: [StagedPage], _ outcome: ReceiptReading.Outcome
    ) -> ReceiptReading {
        ReceiptReading(id: id, pages: pages, outcome: outcome)
    }
}
