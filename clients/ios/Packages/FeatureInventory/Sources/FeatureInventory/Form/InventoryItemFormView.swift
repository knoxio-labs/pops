import AppCore
import DesignSystem
import SwiftUI

/// Recording an item, and correcting one: the photographs, then one system
/// form, with the action that makes the record exist in the navigation bar.
///
/// A system inset-grouped form rather than drawn panels: the platform's rows
/// already carry the label, the control and the rule between them. Two
/// groups, because there are two questions: what the thing is and where it
/// goes, then what is written on it. Every tinted control takes Inventory's
/// colour from the one tint set here.
internal struct InventoryItemFormView: View {
    @Bindable internal var model: InventoryItemFormModel
    private let onCreated: @MainActor () -> Void
    @Environment(\.dismiss) private var dismiss
    /// Bumped by Retry to restart the observation after the store ended it.
    @State private var generation = 0
    @State private var pickingPhoto: InventoryPhotoSource?
    @State private var retakingSha256: String?
    @FocusState private var codeFieldFocused: Bool

    internal init(
        model: InventoryItemFormModel, onCreated: @escaping @MainActor () -> Void = {}
    ) {
        self.model = model
        self.onCreated = onCreated
    }

    internal var body: some View {
        NavigationStack {
            content
                .navigationTitle(model.title)
                .popsTitleDisplay(large: false)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        InventoryFormCancelButton(
                            mode: model.mode, hasStagedWork: model.hasStagedWork
                        ) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(model.actionTitle) {
                            Task {
                                if await model.submit() {
                                    dismiss()
                                    if model.mode == .create { onCreated() }
                                }
                            }
                        }
                        .popsProminentGlassButton()
                        .disabled(!model.canSubmit)
                    }
                }
        }
        .tint(.popsInventory)
        .interactiveDismissDisabled(model.hasStagedWork)
        .task(id: generation) { await model.load() }
        .onDisappear { model.cancelScanPrefill() }
        .inventoryPhotoPickerSheet(source: $pickingPhoto) { data in
            if let sha256 = retakingSha256 {
                retakingSha256 = nil
                Task { await model.retake(replacing: sha256, with: data) }
            } else {
                Task { await model.photoCaptured(data) }
            }
        }
        .inventoryUndoCapsule(photoUndoOffer) { offer in
            Task { await model.undoPhotoRemoval(offer) }
        }
        .inventoryWriteFailureAlerts($model.failure)
        .inventoryScanFailureAlerts($model.scanFailure)
        .safeAreaInset(edge: .bottom) {
            if let failure = model.codeSuggestionFailure {
                InventoryCodeSuggestionToast(
                    failure: failure,
                    retry: { Task { await model.retryCodeSuggestion() } },
                    dismiss: { model.codeSuggestionFailure = nil })
            }
        }
        .onChange(of: model.phase) { _, phase in
            if phase == .ready, model.focusesCode { codeFieldFocused = true }
        }
    }

    /// A hand-built binding rather than `$model.photoRunner.undoOffer`:
    /// `photoRunner` is a nested observable object held by `let`, and
    /// SwiftUI's dynamic member binding through one only works for a
    /// property owned directly by the `@Bindable` root.
    private var photoUndoOffer: Binding<InventoryUndoOffer?> {
        Binding(
            get: { model.photoRunner.undoOffer },
            set: { model.photoRunner.undoOffer = $0 })
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading:
            InventoryItemFormSkeleton()
        case .unavailable:
            ErrorStateView(message: InventoryCopy.unavailable) { generation += 1 }
        case .ready:
            form
        }
    }

    private var form: some View {
        Form {
            Section {
                HStack(spacing: PopsSpacing.sm) {
                    InventoryPhotoStrip(
                        photos: model.draft.photos,
                        capture: { pickingPhoto = $0 },
                        retry: { sha256 in Task { await model.retryUpload(sha256: sha256) } },
                        remove: { sha256 in Task { await model.removePhoto(sha256: sha256) } },
                        retake: { sha256, source in
                            retakingSha256 = sha256
                            pickingPhoto = source
                        },
                        reorder: { sha256, direction in
                            Task { await model.movePhoto(sha256, direction) }
                        },
                        thumbnail: { await model.thumbnail($0) }
                    )
                    .background(
                        Color.popsBackground, in: RoundedRectangle(cornerRadius: PopsRadius.card))
                    if model.showsScanButton {
                        InventoryItemScanButton(model: model)
                            .transition(.opacity.combined(with: .scale))
                    }
                }
                .popsMotion(value: model.showsScanButton)
                .listRowInsets(EdgeInsets())
                .listRowBackground(EmptyView())
            }
            typeSection
            identity
            // Every item has a quantity whatever its type, so it stands apart
            // from the type's fields rather than reading as one of them. A
            // container's quantity is always 1 (ADR-002 D3), so the control
            // locks instead of offering a value that would be refused.
            Section { quantityRow }
            labelling
            InventoryFormNotCarriedSection(values: model.notCarried)
        }
        .popsMotion(value: model.draft.typeKey)
        .inventoryInsetGroupedList()
        .popsGroundedSwipeActionsContainer()
        // Without this, a tap that moves on from a just-typed field (Name to
        // Type, Name to a protocol-2 field) can land while the keyboard is
        // still dismissing and miss its target row entirely — the keyboard
        // stays focused on the field just typed into, and whatever the next
        // tap was meant to change gets typed there instead. `ReceiptDraftView`
        // carries the same modifier for the same class of tap.
        .scrollDismissesKeyboard(.interactively)
        .task(id: model.draft.code.value) { await model.checkCode() }
    }

    private var typeSection: some View {
        Section {
            if let catalogue = model.protocol2Catalogue {
                InventoryProtocol2TypePicker(
                    model: model, catalogue: catalogue, selected: model.protocol2Draft)
            } else {
                InventoryFormTypeRow(
                    types: model.catalogue.types, offersNone: model.offersNoType,
                    typeKey: Binding(
                        get: { model.draft.typeKey }, set: { model.selectLegacyType($0) }))
            }
        } footer: {
            if let message = model.prefillStatus?.message {
                Text(message)
                    .lineLimit(1)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    private var labelling: some View {
        Section {
            InventoryFormCodeRow(
                entry: model.draft.code, onChange: { model.codeChanged(to: $0) },
                onSuggest: { Task { await model.retryCodeSuggestion() } },
                focus: $codeFieldFocused)
            InventoryFormNoteRow(note: $model.draft.note)
            InventoryFormIdentifierRows(draft: $model.draft)
        } footer: {
            VStack(alignment: .leading) {
                footer(for: labellingIssues)
                if model.draft.code.heldBy != nil, let freeCode = model.freeCode {
                    Button("Use \(freeCode)") { model.useFreeCode() }
                        .accessibilityIdentifier(InventoryAccessibility.useFreeCode)
                }
            }
        }
    }

    /// A code already worn is said as soon as it is known, because it is a
    /// fact about the code, not a complaint about the person. Everything else
    /// waits for the first press of the final action.
    private var labellingIssues: [InventoryDraftIssue] {
        model.issues.filter { issue in
            switch issue {
            case .codeTaken: true
            case .identifierIncomplete, .identifierInvalid: model.showsValidation
            default: false
            }
        }
    }

    @ViewBuilder
    internal func footer(
        for issues: [InventoryDraftIssue], additional: [String] = []
    ) -> some View {
        let messages = issues.map(\.message) + additional
        if !messages.isEmpty {
            Text(messages.joined(separator: "\n"))
                .foregroundStyle(Color.popsDestructive)
        }
    }
}
