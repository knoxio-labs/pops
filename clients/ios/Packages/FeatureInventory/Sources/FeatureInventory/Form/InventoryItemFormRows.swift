import AppCore
import DesignSystem
import Foundation
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
            ForEach(InventoryFormTypeOptions.legacy(types)) { option in
                Text(option.label)
                    .tag(Optional(option.id))
                    .accessibilityIdentifier(option.accessibilityIdentifier)
            }
        }
        .pickerStyle(.menu)
        .accessibilityIdentifier(InventoryAccessibility.itemTypePicker)
    }
}

/// One entry of the item form's Type menu.
internal struct InventoryFormTypeOption: Identifiable, Equatable {
    internal let id: String
    internal let label: String

    /// The option's handle for a driver: its words are owner-authored and
    /// may repeat, its id never does.
    internal var accessibilityIdentifier: String {
        InventoryAccessibility.itemTypeOption(id: id)
    }
}

/// What the Type menu lists, apart from the menu itself, so the options and
/// the handles automation taps them by are pinned by a test.
internal enum InventoryFormTypeOptions {
    /// Every active type in alphabetical order, plus `selectedId` even once
    /// archived: an item already of a retired type still reads its type,
    /// but no other item can newly take it.
    internal static func protocol2(
        _ catalogue: InventoryCatalogueSnapshot, selectedId: String
    ) -> [InventoryFormTypeOption] {
        alphabetically(
            catalogue.types
                .filter { $0.archivedAt == nil || $0.id == selectedId }
                .map { InventoryFormTypeOption(id: $0.id, label: $0.label) })
    }

    /// A protocol-1 catalogue's types, keyed by type key.
    internal static func legacy(_ types: [InventoryType]) -> [InventoryFormTypeOption] {
        alphabetically(types.map { InventoryFormTypeOption(id: $0.key, label: $0.name) })
    }

    private static func alphabetically(
        _ options: [InventoryFormTypeOption]
    ) -> [InventoryFormTypeOption] {
        options.sorted { left, right in
            switch left.label.localizedCaseInsensitiveCompare(right.label) {
            case .orderedAscending: true
            case .orderedDescending: false
            case .orderedSame:
                left.id.localizedCaseInsensitiveCompare(right.id) == .orderedAscending
            }
        }
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
