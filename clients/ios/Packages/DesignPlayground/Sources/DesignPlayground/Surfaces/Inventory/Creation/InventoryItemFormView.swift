import DesignSystem
import SwiftUI

/// Recording an item, and correcting one: the photographs, then one form, with
/// the action that makes the record exist in the navigation bar.
///
/// A system inset-grouped form rather than a stack of drawn panels. The
/// platform's own rows already carry the label, the control and the rule
/// between them, and every panel a screen draws for itself is a panel that has
/// to be kept in step with the one Settings draws. Two groups, because there
/// are two questions: what the thing is and where it goes, then what is
/// written on it.
///
/// Nothing exists until Create, which is why Cancel asks whenever there is
/// anything to lose and says nothing when there is not. Every tinted control
/// takes Inventory's colour from the one tint set here.
internal struct InventoryItemFormView: View {
    internal let draft: InventoryDraft
    internal let mode: InventoryItemFormMode
    /// Whether the unanswered values are being pointed at. False until the
    /// final action has been pressed once: a form that reddens a name field
    /// before anybody has typed is a form that opens accusing.
    internal let showsValidation: Bool
    /// Whether the discard confirmation is already up, so the moment can be
    /// looked at rather than performed.
    internal let cancelling: Bool
    @State private var typeName: String

    internal init(
        draft: InventoryDraft,
        mode: InventoryItemFormMode = .create,
        showsValidation: Bool = false,
        cancelling: Bool = false
    ) {
        self.draft = draft
        self.mode = mode
        self.showsValidation = showsValidation
        self.cancelling = cancelling
        _typeName = State(initialValue: draft.typeName ?? InventoryFormType.none)
    }

    internal var body: some View {
        Form {
            Section {
                InventoryPhotoStrip(photos: draft.photos)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.popsBackground)
            }
            identity
            labelling
        }
        .inventoryMotion(value: typeName)
        .playgroundInsetGroupedList()
        .navigationTitle(mode.title)
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem {
            InventoryCancelButton(draft: draft, presenting: cancelling)
        }
        .playgroundTrailingBarItem {
            Button(mode.actionTitle) {}
                .playgroundProminentGlassButton()
                .tint(.popsInventory)
                .disabled(!draft.isNamed)
        }
        .tint(.popsInventory)
    }

    private var identity: some View {
        Section {
            InventoryFormNameRow(draft: draft)
            InventoryFormDestinationRow(choice: draft.placement, name: draft.name)
            InventoryFormTypeRow(chosen: $typeName)
            InventoryFormQuantityRow(draft: draft)
            typeFields
        } footer: {
            if showsValidation, !draft.isNamed {
                Text(InventoryDraftIssue.nameMissing.message)
                    .foregroundStyle(Color.popsDestructive)
            }
        }
    }

    private var labelling: some View {
        Section {
            InventoryFormCodeRow(entry: draft.code)
            InventoryFormNoteRow(draft: draft)
            InventoryFormIdentifierRows(identifiers: draft.identifiers)
        } footer: {
            if let note = draft.code.assist.note {
                Text(note)
                    .foregroundStyle(Color.popsDestructive)
            }
        }
    }

    /// The chosen type's fields, inline under the type that brought them, the
    /// way Contacts reveals the fields of what you just picked.
    @ViewBuilder private var typeFields: some View {
        if let template = InventoryFormType.named(typeName) {
            ForEach(template.fields) { field in
                InventoryFormFieldRow(field: field, value: value(of: field))
                    .transition(.opacity)
            }
        }
    }

    private func value(of field: InventoryTemplateField) -> InventoryPropertyValue? {
        draft.values.first { $0.id == field.id }?.value
    }
}
