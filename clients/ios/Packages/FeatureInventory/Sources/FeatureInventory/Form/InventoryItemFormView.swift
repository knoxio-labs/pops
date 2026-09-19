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
    @Environment(\.dismiss) private var dismiss
    /// Bumped by Retry to restart the observation after the store ended it.
    @State private var generation = 0
    @State private var pickingPhoto: InventoryPhotoSource?
    @State private var retakingSha256: String?

    internal var body: some View {
        NavigationStack {
            content
                .navigationTitle(model.mode.title)
                .inventoryTitleDisplay(large: false)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        InventoryFormCancelButton(
                            mode: model.mode, hasStagedWork: model.hasStagedWork
                        ) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(model.mode.actionTitle) {
                            Task { if await model.submit() { dismiss() } }
                        }
                        .inventoryProminentGlassButton()
                        .disabled(!model.canSubmit)
                    }
                }
        }
        .tint(.popsInventory)
        .interactiveDismissDisabled(model.hasStagedWork)
        .task(id: generation) { await model.load() }
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
        .alert(
            InventoryCopy.failureTitle,
            isPresented: Binding(
                get: { model.failure != nil }, set: { if !$0 { model.failure = nil } }),
            presenting: model.failure
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { failure in
            Text(InventoryCopy.message(for: failure))
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
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.popsBackground)
            }
            identity
            labelling
        }
        .inventoryMotion(value: model.draft.typeKey)
        .inventoryInsetGroupedList()
        .task(id: model.draft.code.value) { await model.checkCode() }
    }

    private var identity: some View {
        Section {
            InventoryFormTextRow(
                "Name", placeholder: "Name", text: $model.draft.name,
                identifier: InventoryAccessibility.itemNameField)
            InventoryFormDestinationRow(draft: $model.draft)
            InventoryFormTypeRow(
                types: model.catalogue.types, offersNone: model.offersNoType,
                typeKey: $model.draft.typeKey)
            InventoryFormQuantityRow(count: $model.draft.quantity)
            ForEach(model.fields) { field in
                InventoryFormFieldRow(
                    field: field,
                    entry: model.draft.entry(for: field, units: model.catalogue.units),
                    units: InventoryFormUnits.options(for: field, in: model.catalogue.units)
                ) { model.draft.set($0, for: field) }
                .transition(.opacity)
            }
        } footer: {
            footer(for: identityIssues)
        }
    }

    private var labelling: some View {
        Section {
            InventoryFormCodeRow(
                entry: model.draft.code, onChange: { model.codeChanged(to: $0) },
                onSuggest: { Task { await model.suggestCode() } })
            InventoryFormNoteRow(note: $model.draft.note)
            InventoryFormIdentifierRows(draft: $model.draft)
        } footer: {
            footer(for: labellingIssues)
        }
    }

    /// A code already worn is said as soon as it is known, because it is a
    /// fact about the code, not a complaint about the person. Everything else
    /// waits for the first press of the final action.
    private var labellingIssues: [InventoryDraftIssue] {
        model.issues.filter { issue in
            switch issue {
            case .codeTaken: true
            case .identifierIncomplete: model.showsValidation
            default: false
            }
        }
    }

    private var identityIssues: [InventoryDraftIssue] {
        guard model.showsValidation else { return [] }
        return model.issues.filter { issue in
            switch issue {
            case .codeTaken, .identifierIncomplete: false
            default: true
            }
        }
    }

    @ViewBuilder
    private func footer(for issues: [InventoryDraftIssue]) -> some View {
        if !issues.isEmpty {
            Text(issues.map(\.message).joined(separator: "\n"))
                .foregroundStyle(Color.popsDestructive)
        }
    }
}

/// Leaving asks only when there is something to lose, and says nothing when
/// there is not.
private struct InventoryFormCancelButton: View {
    let mode: InventoryItemFormMode
    let hasStagedWork: Bool
    let leave: () -> Void
    @State private var confirming = false

    var body: some View {
        Button("Cancel") {
            if hasStagedWork { confirming = true } else { leave() }
        }
        .confirmationDialog(title, isPresented: $confirming, titleVisibility: .visible) {
            Button(keepTitle, role: .cancel) {}
            Button("Discard", role: .destructive, action: leave)
        } message: {
            Text(message)
        }
    }

    private var title: String {
        mode == .create ? "Discard this item?" : "Discard your changes?"
    }

    private var keepTitle: String {
        mode == .create ? "Keep the draft" : "Keep editing"
    }

    private var message: String {
        mode == .create
            ? "Nothing has been created yet. What you typed is kept until you discard it."
            : "The item stays as it was."
    }
}
