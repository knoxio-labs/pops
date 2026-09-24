import AppCore
import DesignSystem
import SwiftUI

/// The type, from the catalogue this phone last downloaded. "No type yet" is
/// a real answer (POPS-4016); it is not offered once an item has a type,
/// because nothing takes a type away.
internal struct InventoryFormTypeRow: View {
    internal let types: [InventoryType]
    internal let offersNone: Bool
    @Binding internal var typeKey: String?

    internal var body: some View {
        Picker("Type", selection: $typeKey) {
            if offersNone {
                Text("No type yet").tag(String?.none)
            }
            ForEach(types) { type in
                Text(type.name).tag(Optional(type.key))
            }
        }
        .pickerStyle(.menu)
    }
}

internal struct InventoryFormQuantityRow: View {
    @Binding internal var count: Int

    internal var body: some View {
        Stepper(value: $count, in: InventoryItemDraft.quantityRange) {
            LabeledContent("Quantity") {
                Text("\(count)")
                    .monospacedDigit()
            }
        }
    }
}

/// Free prose, for everything the type did not ask for (ADR-001). Grows with
/// what is written rather than opening at the height of a paragraph nobody
/// has typed.
internal struct InventoryFormNoteRow: View {
    @Binding internal var note: String

    internal var body: some View {
        TextField("Note", text: $note, axis: .vertical)
            .lineLimit(1...5)
    }
}

/// The inventory code, typed or suggested.
///
/// Suggest sits beside the field as an icon, because a code is optional and a
/// sheet for an optional value turns an offer into a step. What came back is
/// said in the group's footer.
internal struct InventoryFormCodeRow: View {
    internal let entry: InventoryCodeEntry
    internal let onChange: (String) -> Void
    internal let onSuggest: () -> Void
    /// Set when the form was opened to label an item that has no code yet,
    /// so the field takes the keyboard as soon as it appears rather than
    /// leaving the person to find it.
    internal var focus: FocusState<Bool>.Binding?

    internal var body: some View {
        InventoryFormTextRow(
            "Code", placeholder: "Optional",
            text: Binding(get: { entry.value }, set: { onChange($0) }), monospaced: true,
            focus: focus
        ) {
            suggest
        }
        .inventoryCodeCapitalization()
    }

    @ViewBuilder private var suggest: some View {
        switch entry.assist {
        case .suggesting:
            ProgressView()
                .accessibilityLabel("Looking for a free code")
        case .offline:
            InventorySymbol.offline.image
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityLabel("Offline, so no code can be suggested")
        case .unavailable:
            InventorySymbol.offline.image
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityLabel("No code can be suggested right now")
        case .idle, .offered, .accepted, .rejected, .edited:
            Button(action: onSuggest) {
                InventorySymbol.suggest.image
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Suggest a code")
        }
    }
}

/// One labelled text row: the label leading, the field filling the middle
/// with its text trailing, and an optional icon at the end, on one line.
///
/// One `HStack` inside `LabeledContent` rather than several content views,
/// because `LabeledContent` stacks several vertically and the icon then wraps
/// under the label. A monospaced field keeps the body font until something
/// is typed, so its placeholder reads like every other one.
internal struct InventoryFormTextRow<Accessory: View>: View {
    private let label: String
    private let placeholder: String
    @Binding private var text: String
    private let monospaced: Bool
    private let identifier: String
    private let focus: FocusState<Bool>.Binding?
    private let accessory: Accessory

    /// `identifier` names the text field itself for a UI flow; a flow cannot
    /// reach it by text, because its label and its placeholder read the same.
    /// `focus`, when given, lets a caller command the keyboard to this field
    /// as soon as it appears.
    internal init(
        _ label: String, placeholder: String, text: Binding<String>, monospaced: Bool = false,
        identifier: String = "", focus: FocusState<Bool>.Binding? = nil,
        @ViewBuilder accessory: () -> Accessory
    ) {
        self.label = label
        self.placeholder = placeholder
        _text = text
        self.monospaced = monospaced
        self.identifier = identifier
        self.focus = focus
        self.accessory = accessory()
    }

    internal var body: some View {
        LabeledContent {
            HStack(spacing: PopsSpacing.sm) {
                field
                    .font(monospaced && !text.isEmpty ? .popsMonospaced : .popsBody)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    .accessibilityIdentifier(identifier)
                accessory
            }
        } label: {
            Text(label)
                .lineLimit(1)
                .fixedSize()
        }
    }

    @ViewBuilder private var field: some View {
        if let focus {
            TextField(placeholder, text: $text).focused(focus)
        } else {
            TextField(placeholder, text: $text)
        }
    }
}

extension InventoryFormTextRow where Accessory == EmptyView {
    internal init(
        _ label: String, placeholder: String, text: Binding<String>, monospaced: Bool = false,
        identifier: String = "", focus: FocusState<Bool>.Binding? = nil
    ) {
        self.init(
            label, placeholder: placeholder, text: text, monospaced: monospaced,
            identifier: identifier, focus: focus
        ) {
            EmptyView()
        }
    }
}
