import AppCore
import SwiftUI

/// Where each of the capture menu's four entries lands.
///
/// The camera and the two pickers are system UI and are not designed here,
/// so each opens on what it would have produced: a scan as one three-page
/// receipt, photos as four, a file among photographs. Typing opens the form.
internal struct PurchaseCaptureSheet: View {
    internal let source: PurchaseCaptureSource

    internal var body: some View {
        NavigationStack {
            switch source {
            case .scan:
                PurchaseStagingGrid(receipts: [
                    receipt("scan", ["Scan page 1", "Scan page 2", "Scan page 3"])
                ])
            case .photos:
                PurchaseStagingGrid(
                    receipts: ["IMG_4821.HEIC", "IMG_4822.HEIC", "IMG_4823.HEIC", "IMG_4824.HEIC"]
                        .enumerated()
                        .map { index, name in
                            StagedReceipt(
                                id: "photo-\(index)",
                                pages: [PurchaseCaptureSurfaces.page(index, name)])
                        })
            case .file:
                PurchaseStagingGrid(receipts: [
                    StagedReceipt(
                        id: "file",
                        pages: [
                            PurchaseCaptureSurfaces.page(0, "tax-invoice-8841.pdf", media: .pdf)
                        ])
                ])
            case .hand:
                PurchaseHandEntryView()
            }
        }
        // Swiping the form away would throw out what was typed without the
        // question its Cancel asks first.
        .interactiveDismissDisabled(source == .hand)
    }

    private func receipt(_ id: String, _ labels: [String]) -> StagedReceipt {
        StagedReceipt(
            id: id,
            pages: labels.enumerated().map { index, label in
                PurchaseCaptureSurfaces.page(index, label)
            })
    }
}
