import AppCore
import DesignSystem
import SwiftUI

/// A saved purchase and the action to perform after its edit is stored.
public struct PurchaseEditRequest: Sendable {
    internal let detail: PurchaseDetail
    internal let onSaved: @MainActor @Sendable (PurchaseDetail) -> Void

    /// Creates a request to edit one loaded purchase.
    ///
    /// - Parameters:
    ///   - detail: The current saved detail, including its opaque update token.
    ///   - onSaved: Called once with the server-confirmed replacement after a successful save.
    public init(
        detail: PurchaseDetail,
        onSaved: @escaping @MainActor @Sendable (PurchaseDetail) -> Void
    ) {
        self.detail = detail
        self.onSaved = onSaved
    }
}

/// Edits a saved purchase while retaining its draft after a failed save.
public struct PurchaseEditSheet: View {
    @State private var model: PurchaseEditModel
    @Environment(\.dismiss) private var dismiss
    private let request: PurchaseEditRequest

    /// Creates the edit sheet for a loaded purchase request.
    ///
    /// - Parameters:
    ///   - request: The loaded detail and its one-shot saved callback.
    ///   - dependencies: The repository used to persist the edit.
    public init(request: PurchaseEditRequest, dependencies: AppDependencies) {
        self.request = request
        _model = State(
            wrappedValue: PurchaseEditModel(detail: request.detail, dependencies: dependencies))
    }

    public var body: some View {
        ReceiptDraftView(
            draft: model.opened,
            complaints: .hintsOnly,
            lock: PurchaseEditPolicy.lock(for: request.detail.purchase.status),
            commit: .navigationBar,
            onChange: model.updateDraft,
            lineRemovalNotice: removalNotice,
            isSaving: model.saving,
            save: { draft in
                model.updateDraft(draft)
                Task { await save() }
            }
        )
        .disabled(model.saving)
        .navigationTitle("Edit purchase")
        .popsTitleDisplay(large: false)
        .toolbar { ToolbarItem(placement: .cancellationAction) { cancelButton } }
        .interactiveDismissDisabled(model.changed || model.saving)
        .confirmationDialog(
            "Discard your changes?",
            isPresented: discardConfirmationPresented,
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) { model.keepEditing() }
        } message: {
            Text("The purchase stays as it was.")
        }
        .alert(
            "Couldn't save",
            isPresented: failurePresented,
            presenting: model.failure
        ) { _ in
            Button("Keep editing", role: .cancel) { model.dismissFailure() }
            Button("Retry") { Task { await save() } }
        } message: { failure in
            Text(failure.message)
        }
        .tint(.popsPurchases)
    }

    private var cancelButton: some View {
        Button("Cancel") {
            if model.requestCancel() == .dismiss { dismiss() }
        }
        .disabled(model.saving)
    }

    private var discardConfirmationPresented: Binding<Bool> {
        Binding(
            get: { model.confirmingDiscard },
            set: { presented in if !presented { model.keepEditing() } })
    }

    private var failurePresented: Binding<Bool> {
        Binding(
            get: { model.failure != nil },
            set: { presented in if !presented { model.dismissFailure() } })
    }

    private func removalNotice(for lineID: String) -> String? {
        request.detail.lines.first(where: { $0.id == lineID }).flatMap(
            PurchaseEditPolicy.unlinkNotice)
    }

    private func save() async {
        guard let saved = await model.save() else { return }
        request.onSaved(saved)
        dismiss()
    }
}
