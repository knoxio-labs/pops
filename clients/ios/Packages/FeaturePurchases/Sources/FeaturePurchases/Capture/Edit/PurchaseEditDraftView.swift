extension ReceiptDraftView {
    internal init(
        savedPurchase draft: ReceiptDraft,
        lock: ReceiptDraftLock?,
        onChange: @escaping (ReceiptDraft) -> Void,
        lineRemovalNotice: @escaping (String) -> String?,
        saveEligibility: @escaping (ReceiptDraft) -> Bool,
        isSaving: Bool,
        save: @escaping (ReceiptDraft) -> Void
    ) {
        self.init(
            owned: draft, host: nil, title: nil, subtitle: nil, status: nil,
            complaints: .hintsOnly,
            searchMerchants: { _ in [] },
            merchantPreview: { _ in nil },
            addressesForMerchant: { _ in [] },
            addressPreview: { _, _ in nil },
            parts: [], secondaryAction: nil,
            addAnother: nil, lock: lock, commit: .navigationBar, onChange: onChange,
            lineRemovalNotice: lineRemovalNotice, formPresentation: .savedPurchase,
            saveEligibility: saveEligibility, isSaving: isSaving, save: save)
    }
}
