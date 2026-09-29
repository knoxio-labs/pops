import AppCore
import DesignSystem
import SwiftUI

/// The type, from the catalogue this phone last downloaded.
internal struct InventoryFormTypeRow: View {
    internal let types: [InventoryType]
    internal let offersNone: Bool
    @Binding internal var typeKey: String?
    @State private var pickerIsPresented = false

    internal var body: some View {
        Button {
            pickerIsPresented = true
        } label: {
            LabeledContent("Type") {
                Text(selectedLabel)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .buttonStyle(.plain)
        .navigationDestination(isPresented: $pickerIsPresented) {
            InventoryFormTypePicker(
                selection: $typeKey,
                options: InventoryFormTypeOptions.legacy(types),
                noneTitle: offersNone ? "No type yet" : nil,
                noneAccessibilityIdentifier: offersNone
                    ? InventoryAccessibility.itemTypeNone : nil,
                onChoose: { id in
                    typeKey = id
                    pickerIsPresented = false
                })
        }
        .accessibilityIdentifier(InventoryAccessibility.itemTypePicker)
    }

    private var selectedLabel: String {
        guard let typeKey, let type = types.first(where: { $0.key == typeKey }) else {
            return "No type yet"
        }
        return type.name
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
        InventoryFormFocusableRow { focus in
            TextField("Note", text: $note, axis: .vertical)
                .focused(focus)
                .lineLimit(1...5)
        }
    }
}

internal struct InventoryFormFocusableRow<Content: View>: View {
    private let externalFocus: FocusState<Bool>.Binding?
    private let content: (FocusState<Bool>.Binding) -> Content
    @FocusState private var localFocus: Bool

    internal init(
        focus: FocusState<Bool>.Binding? = nil,
        @ViewBuilder content: @escaping (FocusState<Bool>.Binding) -> Content
    ) {
        externalFocus = focus
        self.content = content
    }

    internal var body: some View {
        if let externalFocus {
            focusedContent(content(externalFocus)) {
                externalFocus.wrappedValue = true
            }
        } else {
            focusedContent(content($localFocus)) {
                localFocus = true
            }
        }
    }

    private func focusedContent(
        _ content: Content, onTap: @escaping () -> Void
    ) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
            .onTapGesture(perform: onTap)
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
        case .idle, .offered, .accepted, .rejected, .edited, .offline, .unavailable:
            Button(action: onSuggest) {
                InventorySymbol.suggest.image
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Suggest a code")
        }
    }
}

/// One text row with an optional leading label and trailing icon.
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
    private let showsLabel: Bool
    private let accessory: Accessory

    /// `identifier` names the text field itself for a UI flow; a flow cannot
    /// reach it by text, because its label and its placeholder read the same.
    /// `focus`, when given, lets a caller command the keyboard to this field
    /// as soon as it appears.
    internal init(
        _ label: String, placeholder: String, text: Binding<String>, monospaced: Bool = false,
        identifier: String = "", focus: FocusState<Bool>.Binding? = nil, showsLabel: Bool = true,
        @ViewBuilder accessory: () -> Accessory
    ) {
        self.label = label
        self.placeholder = placeholder
        _text = text
        self.monospaced = monospaced
        self.identifier = identifier
        self.focus = focus
        self.showsLabel = showsLabel
        self.accessory = accessory()
    }

    internal var body: some View {
        InventoryFormFocusableRow(focus: focus) { focus in
            if showsLabel {
                LabeledContent {
                    content(focus: focus)
                } label: {
                    Text(label)
                        .lineLimit(1)
                        .fixedSize()
                }
            } else {
                content(focus: focus)
            }
        }
    }

    private func content(focus: FocusState<Bool>.Binding) -> some View {
        HStack(spacing: PopsSpacing.sm) {
            field(focus: focus)
                .font(monospaced && !text.isEmpty ? .popsMonospaced : .popsBody)
                .multilineTextAlignment(.leading)
                .lineLimit(1)
                .accessibilityLabel(label)
                .accessibilityIdentifier(identifier)
            accessory
        }
    }

    @ViewBuilder private func field(focus: FocusState<Bool>.Binding) -> some View {
        TextField(placeholder, text: $text).focused(focus)
    }
}

extension InventoryFormTextRow where Accessory == EmptyView {
    internal init(
        _ label: String, placeholder: String, text: Binding<String>, monospaced: Bool = false,
        identifier: String = "", focus: FocusState<Bool>.Binding? = nil, showsLabel: Bool = true
    ) {
        self.init(
            label, placeholder: placeholder, text: text, monospaced: monospaced,
            identifier: identifier, focus: focus, showsLabel: showsLabel
        ) {
            EmptyView()
        }
    }
}
