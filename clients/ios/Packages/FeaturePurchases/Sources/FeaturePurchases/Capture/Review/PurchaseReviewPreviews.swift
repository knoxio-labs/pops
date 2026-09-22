#if DEBUG

    import AppCore
    import SwiftUI

    @MainActor
    private struct PurchaseReviewPreview: View {
        let model: PurchaseReviewViewModel
        let startsSaving: Bool

        var body: some View {
            NavigationStack {
                PurchaseReviewView(
                    model: model,
                    searchMerchants: { _ in [] },
                    merchantPreview: { _ in nil },
                    addressesForMerchant: { _ in [] },
                    addressPreview: { _, _ in nil },
                    onCancel: {},
                    onFinished: { _ in })
            }
            .task {
                if startsSaving { await model.save() }
            }
        }
    }

    private actor PreviewReviewRepository: ReceiptCaptureRepository {
        private let results: [Result<ReceiptPurchase, RepositoryError>]
        private var call = 0

        init(_ results: [Result<ReceiptPurchase, RepositoryError>]) {
            self.results = results
        }

        func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
            throw RepositoryError.dependencyNotBound
        }

        func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
            try next()
        }

        func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
            -> ReceiptPurchase
        {
            try next()
        }

        private func next() throws -> ReceiptPurchase {
            defer { call += 1 }
            guard results.indices.contains(call) else {
                throw RepositoryError.transport("preview write script exhausted")
            }
            return try results[call].get()
        }
    }

    @MainActor
    private func previewEntries(_ count: Int = 3) -> [ReviewEntry] {
        (0..<count).map { index in
            let reading = ReceiptDraftReading(
                receiptUris: ["pops://purchases/receipt/preview-\(index)"],
                reconciled: true,
                failures: [],
                extracted: PreviewReceipt.extracted,
                capture: nil,
                matchedMerchantEntityID: "merchant-preview")
            return ReviewEntry(
                id: "preview-\(index)",
                draft: ReceiptDraftPresentation().draft(
                    extracted: reading.extracted,
                    failures: reading.failures,
                    matchedMerchantID: reading.matchedMerchantEntityID),
                origin: .read,
                reading: reading,
                status: nil,
                parts: PreviewReceipt.pages(index + 1))
        }
    }

    #Preview("Review — standard") {
        PurchaseReviewPreview(
            model: PurchaseReviewViewModel(
                entries: previewEntries(),
                repository: PreviewReviewRepository([])),
            startsSaving: false)
    }

    #Preview("Review — save failed partway") {
        PurchaseReviewPreview(
            model: PurchaseReviewViewModel(
                entries: previewEntries(),
                repository: PreviewReviewRepository([
                    .success(PreviewReceipt.purchase), .failure(.unavailable),
                ])),
            startsSaving: true)
    }

    #Preview("Review — duplicate") {
        PurchaseReviewPreview(
            model: PurchaseReviewViewModel(
                entries: previewEntries(1),
                repository: PreviewReviewRepository([
                    .failure(.conflict("upstream_conflict"))
                ])),
            startsSaving: true)
    }

#endif
