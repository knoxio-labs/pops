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
        synopsis: "What was picked, one receipt per file until somebody groups them.",
        chrome: .navigation,
        states: [
            DesignState.standard {
                PurchaseStagingSurface(receipts: [
                    receipt("r1", [page(0, "IMG_4821.HEIC")]),
                    receipt("r2", [page(1, "IMG_4822.HEIC")]),
                    receipt("r3", [page(2, "IMG_4823.HEIC")]),
                    receipt("r4", [page(3, "IMG_4824.HEIC")]),
                ])
            },
            DesignState("single", "One photograph") {
                PurchaseStagingSurface(receipts: [receipt("r1", [page(0, "IMG_4821.HEIC")])])
            },
            // What the camera produces: a scan is already one receipt, so this
            // is the state a person reaches without ever touching Combine.
            DesignState("scan", "A three-page scan") {
                PurchaseStagingSurface(receipts: [
                    receipt(
                        "r1",
                        [
                            page(0, "Scan page 1"), page(1, "Scan page 2"),
                            page(2, "Scan page 3"),
                        ])
                ])
            },
            DesignState("selecting", "Two selected, ready to combine") {
                PurchaseStagingSurface(
                    receipts: [
                        receipt("r1", [page(0, "IMG_4821.HEIC")]),
                        receipt("r2", [page(1, "IMG_4822.HEIC")]),
                        receipt("r3", [page(2, "IMG_4823.HEIC")]),
                    ],
                    selection: ["pg-0", "pg-1"]
                )
            },
            DesignState("combined", "One grouped, one not") {
                PurchaseStagingSurface(receipts: [
                    receipt("r1", [page(0, "IMG_4821.HEIC"), page(1, "IMG_4822.HEIC")]),
                    receipt("r2", [page(2, "IMG_4823.HEIC")]),
                ])
            },
            DesignState("mixed", "A file among the photographs") {
                PurchaseStagingSurface(receipts: [
                    receipt("r1", [page(0, "IMG_4821.HEIC")]),
                    receipt("r2", [page(1, "tax-invoice-8841.pdf", media: .pdf)]),
                    receipt("r3", [page(2, "order-confirmation.txt", media: .plainText)]),
                ])
            },
            // The BFM refuses more than `ReceiptPart.maxPerReceipt`, so the
            // refusal happens here with the count rather than as a rejection
            // after the bytes went up.
            DesignState("over-cap", "A group past the page cap") {
                PurchaseStagingSurface(receipts: [
                    receipt("r1", (0..<10).map { page($0, "Scan page \($0 + 1)") })
                ])
            },
        ]
    )

    static let reading = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "reading"),
        title: "Reading",
        synopsis: "The paper, while a model reads it, and when it cannot.",
        chrome: .navigation,
        states: [
            DesignState.standard {
                PurchaseReadingSurface(
                    pages: [
                        page(0, "Scan page 1"), page(1, "Scan page 2"), page(2, "Scan page 3"),
                    ],
                    progress: .reading(done: 0, total: 1)
                )
            },
            DesignState("one-of-four", "Third of four receipts") {
                PurchaseReadingSurface(
                    pages: [page(2, "IMG_4823.HEIC")],
                    progress: .reading(done: 2, total: 4)
                )
            },
            DesignState("unreadable", "Could not be read") {
                PurchaseReadingSurface(
                    pages: [page(1, "IMG_4822.HEIC")],
                    progress: .unreadable(page: "IMG_4822.HEIC")
                )
            },
        ]
    )
}
