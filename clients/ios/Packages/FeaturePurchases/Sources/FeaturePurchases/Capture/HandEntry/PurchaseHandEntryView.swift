import AppCore
import DesignSystem
import SwiftUI

internal enum PurchaseHandEntryPolicy {
    internal static func asksBeforeCancel(draft: ReceiptDraft, opened: ReceiptDraft) -> Bool {
        draft != opened
    }

    internal static func cancelMessage(saved: Int) -> String {
        saved == 0 ? "Nothing is saved yet." : ReviewSaving.alreadySaved(saved)
    }
}

internal struct PurchaseHandEntryView: View {
    private let model: PurchaseHandEntryViewModel
    private let searchMerchants: ReceiptMerchantSearch
    private let merchantPreview: ReceiptMerchantPreview
    private let addressesForMerchant: ReceiptAddressesForMerchant
    private let addressPreview: ReceiptAddressPreview
    private let onFinished: ([Purchase.ID]) -> Void

    @State private var draft: ReceiptDraft
    @State private var opened: ReceiptDraft
    @State private var confirmingCancel = false
    @State private var didFinish = false

    internal init(
        model: PurchaseHandEntryViewModel,
        searchMerchants: @escaping ReceiptMerchantSearch,
        merchantPreview: @escaping ReceiptMerchantPreview,
        addressesForMerchant: @escaping ReceiptAddressesForMerchant,
        addressPreview: @escaping ReceiptAddressPreview,
        onFinished: @escaping ([Purchase.ID]) -> Void
    ) {
        self.model = model
        self.searchMerchants = searchMerchants
        self.merchantPreview = merchantPreview
        self.addressesForMerchant = addressesForMerchant
        self.addressPreview = addressPreview
        self.onFinished = onFinished
        _draft = State(initialValue: model.draft)
        _opened = State(initialValue: model.draft)
    }

    internal var body: some View {
        ReceiptDraftView(
            draft: $draft,
            complaints: .hintsOnly,
            searchMerchants: searchMerchants,
            merchantPreview: merchantPreview,
            addressesForMerchant: addressesForMerchant,
            addressPreview: addressPreview
        )
        .id(model.formGeneration)
        .disabled(model.isSaving)
        .transition(.push(from: .trailing))
        .navigationTitle("New purchase")
        .navigationSubtitle(model.saved > 0 ? ReviewSaving.saved(model.saved) : "")
        .popsTitleDisplay(large: false)
        .navigationBarBackButtonHidden()
        .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) { failureNotice }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { cancelButton }
            ToolbarItemGroup(placement: .confirmationAction) {
                moreMenu
                saveButton
            }
        }
        .popsMotion(value: model.formGeneration)
        .popsMotion(value: model.failure)
        .onChange(of: model.formGeneration) {
            draft = model.draft
            opened = model.draft
        }
        .tint(.popsPurchases)
    }

    @ViewBuilder private var failureNotice: some View {
        if let failure = model.failure {
            PurchaseSaveNotice(reason: PurchaseReviewCopy.saveFailure(failure))
        } else if let failure = model.validationFailure {
            PurchaseSaveNotice(reason: ReceiptDraftCopy.message(for: failure))
        }
    }

    private var cancelButton: some View {
        Button("Cancel", action: cancel)
            .disabled(model.isSaving)
            .confirmationDialog(
                "Discard this purchase?",
                isPresented: $confirmingCancel,
                titleVisibility: .visible
            ) {
                Button("Discard", role: .destructive, action: finish)
                Button("Keep editing", role: .cancel) {}
            } message: {
                Text(PurchaseHandEntryPolicy.cancelMessage(saved: model.saved))
            }
    }

    private var moreMenu: some View {
        Menu("More", systemImage: "ellipsis") {
            Button("Save and add another") {
                Task { await model.addAnother(draft) }
            }
            .disabled(!canSave)
        }
        .disabled(model.isSaving)
    }

    private var saveButton: some View {
        Button(model.isSaving ? "Saving" : "Save") {
            Task {
                guard await model.save(draft) else { return }
                finish()
            }
        }
        .receiptDraftProminentBarButton()
        .disabled(!canSave)
    }

    private var canSave: Bool {
        ReceiptDraftView.canSave(draft, isSaving: model.isSaving)
    }

    private func cancel() {
        if PurchaseHandEntryPolicy.asksBeforeCancel(draft: draft, opened: opened) {
            confirmingCancel = true
        } else {
            finish()
        }
    }

    private func finish() {
        guard !didFinish else { return }
        didFinish = true
        onFinished(model.savedPurchaseIDs)
    }
}
