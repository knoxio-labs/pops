import DesignSystem
import SwiftUI

/// The one required value, with the fastest way to say it.
///
/// The microphone sits in the row rather than on the keyboard's bar, because
/// naming an object you are holding is the moment dictation is worth reaching
/// for and the keyboard may never be opened at all.
internal struct InventoryFormNameRow: View {
    @State private var name: String

    internal init(draft: InventoryDraft) {
        _name = State(initialValue: draft.name)
    }

    internal var body: some View {
        InventoryFormTextRow("Name", placeholder: "Name", text: $name) {
            Button {
            } label: {
                InventorySymbol.dictate.image
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Dictate the name")
        }
    }
}

internal struct InventoryFormTypeRow: View {
    @Binding internal var chosen: String

    internal var body: some View {
        Picker("Type", selection: $chosen) {
            ForEach(InventoryFormType.names, id: \.self) { Text($0).tag($0) }
        }
        .pickerStyle(.menu)
    }
}

internal struct InventoryFormQuantityRow: View {
    @State private var count: Int

    internal init(draft: InventoryDraft) {
        _count = State(initialValue: draft.quantity)
    }

    internal var body: some View {
        Stepper(value: $count, in: 1...999) {
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
    @State private var note: String

    internal init(draft: InventoryDraft) {
        _note = State(initialValue: draft.note)
    }

    internal var body: some View {
        TextField("Note", text: $note, axis: .vertical)
            .lineLimit(1...5)
    }
}

/// The inventory code, typed or suggested.
///
/// Suggest sits beside the field as an icon, because a code is optional and a
/// sheet for an optional value turns an offer into a step. What came back is a
/// footer under the group, which is where the system puts anything a form has
/// to say about a value it already holds.
internal struct InventoryFormCodeRow: View {
    internal let entry: InventoryCodeEntry
    @State private var code: String

    internal init(entry: InventoryCodeEntry) {
        self.entry = entry
        _code = State(initialValue: entry.value)
    }

    internal var body: some View {
        InventoryFormTextRow("Code", placeholder: "Optional", text: $code, monospaced: true) {
            suggest
        }
    }

    @ViewBuilder private var suggest: some View {
        switch entry.assist {
        case .suggesting:
            ProgressView()
                .accessibilityLabel("Looking for a free code")
        case .offline, .unavailable:
            InventorySymbol.offline.image
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityLabel("Offline, so no code can be suggested")
        case .idle, .offered, .accepted, .rejected, .edited, .collision:
            Button {
            } label: {
                InventorySymbol.suggest.image
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Suggest a code")
        }
    }
}

/// One labelled text row: the label leading, the field filling the middle with
/// its text trailing, and an optional icon at the end, all on one line.
///
/// One `HStack` inside `LabeledContent` rather than several content views,
/// because `LabeledContent` stacks multiple content views vertically and the
/// icon then wraps under the label. A monospaced field keeps the body font
/// until something is typed, so its placeholder reads like every other one.
internal struct InventoryFormTextRow<Accessory: View>: View {
    private let label: String
    private let placeholder: String
    @Binding private var text: String
    private let monospaced: Bool
    private let accessory: Accessory

    internal init(
        _ label: String, placeholder: String, text: Binding<String>, monospaced: Bool = false,
        @ViewBuilder accessory: () -> Accessory
    ) {
        self.label = label
        self.placeholder = placeholder
        _text = text
        self.monospaced = monospaced
        self.accessory = accessory()
    }

    internal var body: some View {
        LabeledContent {
            HStack(spacing: PopsSpacing.sm) {
                TextField(placeholder, text: $text)
                    .font(monospaced && !text.isEmpty ? .popsMonospaced : .popsBody)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                accessory
            }
        } label: {
            Text(label)
                .lineLimit(1)
                .fixedSize()
        }
    }
}

extension InventoryFormTextRow where Accessory == EmptyView {
    internal init(
        _ label: String, placeholder: String, text: Binding<String>, monospaced: Bool = false
    ) {
        self.init(
            label, placeholder: placeholder, text: text, monospaced: monospaced
        ) { EmptyView() }
    }
}
