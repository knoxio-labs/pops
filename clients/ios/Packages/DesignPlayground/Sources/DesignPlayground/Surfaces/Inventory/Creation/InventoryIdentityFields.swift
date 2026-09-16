import DesignSystem
import SwiftUI

/// The one required value, with the fastest way to say it.
///
/// The microphone sits inside the field's row rather than on the keyboard's
/// own bar, because naming an object you are holding is the moment dictation
/// is worth reaching for and the keyboard may never be opened at all.
internal struct InventoryNameField: View {
    @State private var name: String

    internal init(name: String) {
        _name = State(initialValue: name)
    }

    internal var body: some View {
        HStack(alignment: .bottom, spacing: PopsSpacing.sm) {
            PopsTextField(
                "Name", placeholder: "What is it", text: $name, font: .popsTitle)
            Button {
            } label: {
                Image(systemName: InventorySymbol.dictate.system)
                    .font(.popsHeadline)
            }
            .playgroundGlassButton()
            .tint(.popsInventory)
            .accessibilityLabel("Dictate the name")
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}

/// The inventory code, typed or suggested, in every state the suggestion can
/// leave it in.
///
/// The field is always editable, including while a suggestion is in flight:
/// the suggestion is an offer, and a person who already knows the code on the
/// sticker should never have to wait for one.
internal struct InventoryCodeField: View {
    internal let entry: InventoryCodeEntry
    @State private var code: String

    internal init(entry: InventoryCodeEntry) {
        self.entry = entry
        _code = State(initialValue: entry.value)
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(alignment: .bottom, spacing: PopsSpacing.sm) {
                PopsTextField(
                    "Inventory code", placeholder: "Only if you label it", text: $code,
                    font: .popsMonospaced, note: note)
                suggestButton
            }
            if !entry.assist.alternatives.isEmpty {
                InventoryChipFlow(spacing: PopsSpacing.xs) {
                    ForEach(entry.assist.alternatives, id: \.self) { alternative in
                        Button(alternative) {}
                            .font(.popsMonospacedCaption)
                            .playgroundGlassButton()
                    }
                }
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private var note: PopsFieldNote? {
        guard let text = entry.assist.note else { return nil }
        return entry.assist.blocksCreation ? .problem(text) : .hint(text)
    }

    @ViewBuilder private var suggestButton: some View {
        switch entry.assist {
        case .suggesting:
            ProgressView()
                .frame(minHeight: PopsSize.touchTarget)
                .accessibilityLabel("Looking for a free code")
        case .offline, .unavailable:
            Image(systemName: unavailableSymbol)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
                .frame(minHeight: PopsSize.touchTarget)
                .accessibilityHidden(true)
        case .idle, .offered, .accepted, .rejected, .edited, .collision:
            Button {
            } label: {
                Label("Suggest", systemImage: InventorySymbol.suggest.system)
                    .font(.popsSubheadline.weight(.semibold))
            }
            .playgroundGlassButton()
            .tint(.popsInventory)
        }
    }

    private var unavailableSymbol: String {
        entry.assist == .offline
            ? InventorySymbol.offline.system : InventorySymbol.unavailable.system
    }
}

/// The type, and the prose for everything it did not ask for.
///
/// Both optional, and side by side so that is visible: a person who does not
/// know what an object is can still record it, and a person who knows more
/// than the type asks has somewhere to put it (ADR-001's note).
internal struct InventoryDescriptionFields: View {
    internal let draft: InventoryDraft
    @State private var note: String

    internal init(draft: InventoryDraft) {
        self.draft = draft
        _note = State(initialValue: draft.note)
    }

    internal var body: some View {
        Group {
            InventoryTypePicker(
                label: "Type",
                selection: draft.typeName ?? InventoryDraftFixtures.types[0],
                options: InventoryDraftFixtures.types,
                footnote: draft.typeName == nil ? "Optional. It decides which fields it has." : nil)
            PopsTextField("Note", placeholder: "Anything the type does not ask for", text: $note)
        }
    }
}

/// The internal id, where nothing reaches it by accident.
///
/// Collapsed by default and never beside a field, because it is not a value
/// anybody enters or checks; it is the answer to "which record" when
/// something has gone wrong enough to ask.
internal struct InventoryTechnicalDetails: View {
    internal let draft: InventoryDraft

    internal var body: some View {
        DisclosureGroup("Technical details") {
            InventoryPropertyLine(
                key: "Internal id", value: draft.internalID,
                footnote: "Assigned here, never edited.",
                tone: .popsMutedForeground)
            if let copiedFrom = draft.copiedFrom {
                InventoryPropertyLine(
                    key: "Copied from", value: copiedFrom, tone: .popsMutedForeground)
            }
        }
        .font(.popsSubheadline)
        .tint(.popsInventory)
    }
}
