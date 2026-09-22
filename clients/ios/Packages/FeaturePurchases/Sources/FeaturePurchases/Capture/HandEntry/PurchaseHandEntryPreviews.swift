#if DEBUG

    import AppCore
    import SwiftUI

    private struct HandEntryPreviewRepository: ReceiptCaptureRepository {
        let result: Result<ReceiptPurchase, RepositoryError>

        func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
            throw RepositoryError.dependencyNotBound
        }

        func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
            throw RepositoryError.dependencyNotBound
        }

        func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
            -> ReceiptPurchase
        {
            try result.get()
        }
    }

    @MainActor
    private struct PurchaseHandEntryPreview: View {
        let model: PurchaseHandEntryViewModel
        let action: Action

        enum Action {
            case none
            case addAnother
            case fail
        }

        var body: some View {
            NavigationStack {
                PurchaseHandEntryView(model: model, merchants: [], onFinished: { _ in })
            }
            .task {
                switch action {
                case .none:
                    break
                case .addAnother:
                    await model.addAnother(Self.filledDraft)
                case .fail:
                    _ = await model.save(Self.filledDraft)
                }
            }
        }

        private static let filledDraft = ReceiptDraftPresentation().draft(
            extracted: PreviewReceipt.extracted,
            failures: [],
            matchedMerchantID: "merchant-preview")
    }

    #Preview("Hand entry — typed") {
        PurchaseHandEntryPreview(
            model: PurchaseHandEntryViewModel(
                repository: HandEntryPreviewRepository(result: .success(PreviewReceipt.purchase))),
            action: .none)
    }

    #Preview("Hand entry — typed another") {
        PurchaseHandEntryPreview(
            model: PurchaseHandEntryViewModel(
                repository: HandEntryPreviewRepository(result: .success(PreviewReceipt.purchase))),
            action: .addAnother)
    }

    #Preview("Hand entry — typed save failed") {
        PurchaseHandEntryPreview(
            model: PurchaseHandEntryViewModel(
                repository: HandEntryPreviewRepository(result: .failure(.unavailable))),
            action: .fail)
    }

#endif
