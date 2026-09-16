import DesignSystem
import SwiftUI

/// Choosing what an object is.
///
/// A real `Picker` in a `List` row rather than a drawn one, so what a reviewer
/// judges is the platform's own menu — its width, where it opens, and what it
/// does to the row at AX5 — rather than a facsimile of it.
internal struct InventoryTypePicker: View {
    internal let label: String
    internal let selection: String
    internal let options: [String]
    internal let footnote: String?

    @State private var chosen: String

    internal init(label: String, selection: String, options: [String], footnote: String? = nil) {
        self.label = label
        self.selection = selection
        self.options = options
        self.footnote = footnote
        _chosen = State(initialValue: selection)
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Picker(label, selection: $chosen) {
                ForEach(options, id: \.self) { Text($0).tag($0) }
            }
            .font(.popsBody)
            if let footnote {
                Text(footnote)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}

/// What swapping one template for another does to what the object knows.
///
/// Three lists rather than a sentence, because the only question worth asking
/// about a type change is which of these three a given value lands in — and a
/// screen that says "your data is safe" without showing the sorting is asking
/// to be believed rather than read.
internal struct InventoryTemplateChangeSummary: View {
    internal let change: InventoryTemplateChange
    /// The variant's own word for a value the new template did not ask for.
    internal let carriedTitle: String
    internal let carriedNote: String

    internal var body: some View {
        Group {
            if !change.kept.isEmpty {
                Section {
                    ForEach(change.kept) {
                        InventoryPropertyLine(key: $0.key, value: $0.value.display)
                    }
                } header: {
                    Text("Kept · \(change.kept.count)")
                } footer: {
                    Text("The new type asks for these too, so nothing moved.")
                }
            }
            if !change.carriedAsCustom.isEmpty {
                Section {
                    ForEach(change.carriedAsCustom) {
                        InventoryPropertyLine(
                            key: $0.key, value: $0.value.display, tone: .popsWarning)
                    }
                } header: {
                    Text("\(carriedTitle) · \(change.carriedAsCustom.count)")
                } footer: {
                    Text(carriedNote)
                }
            }
            if !change.blankFields.isEmpty {
                Section {
                    ForEach(change.blankFields) {
                        InventoryPropertyLine(
                            key: $0.key,
                            value: $0.unit.map { unit in "Empty · \(unit)" } ?? "Empty",
                            tone: .popsMutedForeground
                        )
                    }
                } header: {
                    Text("New and empty · \(change.blankFields.count)")
                } footer: {
                    Text("Fields the new type asks for that nothing has answered yet.")
                }
            }
        }
    }
}
