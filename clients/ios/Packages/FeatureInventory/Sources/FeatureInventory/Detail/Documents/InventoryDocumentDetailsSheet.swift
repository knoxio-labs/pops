import AppCore
import DesignSystem
import SwiftUI

/// The kind and optional title of a document being added or edited, committed
/// from the navigation bar.
internal struct InventoryDocumentDetailsSheet: View {
    internal enum Mode {
        case attach(fileName: String)
        case edit(InventoryLinkedDocument)
    }

    private let mode: Mode
    private let onCommit: (InventoryDocumentKind, String) -> Void
    @State private var kind: InventoryDocumentKind
    @State private var title: String
    @Environment(\.dismiss) private var dismiss

    internal init(mode: Mode, onCommit: @escaping (InventoryDocumentKind, String) -> Void) {
        self.mode = mode
        self.onCommit = onCommit
        switch mode {
        case .attach:
            _kind = State(initialValue: .receipt)
            _title = State(initialValue: "")
        case .edit(let document):
            _kind = State(initialValue: document.kind)
            _title = State(initialValue: document.title ?? "")
        }
    }

    internal var body: some View {
        NavigationStack {
            Form {
                Picker(selection: $kind) {
                    ForEach(InventoryDocumentKind.allCases, id: \.self) { kind in
                        Label {
                            Text(InventoryDocumentCopy.kindName(kind))
                        } icon: {
                            InventorySymbol.document(kind).image
                        }
                        .tag(kind)
                    }
                } label: {
                    Text("Kind")
                }
                TextField("Title", text: $title, prompt: Text(placeholder))
                    .onChange(of: title) { _, newValue in
                        if newValue.count > InventoryDocumentEdit.titleLimit {
                            title = String(newValue.prefix(InventoryDocumentEdit.titleLimit))
                        }
                    }
            }
            .navigationTitle(isAttaching ? InventoryDocumentCopy.add : "Edit document")
            .popsTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isAttaching ? "Add" : "Save") {
                        onCommit(kind, title)
                        dismiss()
                    }
                    .disabled(!canCommit)
                }
            }
        }
        .presentationDetents([.medium])
        .tint(.popsInventory)
    }

    private var isAttaching: Bool {
        if case .attach = mode { true } else { false }
    }

    private var placeholder: String {
        switch mode {
        case .attach(let fileName): fileName
        case .edit(let document): document.title ?? InventoryDocumentCopy.kindName(document.kind)
        }
    }

    private var canCommit: Bool {
        guard case .edit(let document) = mode else { return true }
        return InventoryDocumentEdit.changes(to: document, kind: kind, title: title) != nil
    }
}
