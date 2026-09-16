import DesignSystem
import SwiftUI

/// What "Add" offers: a new item POPS has never seen, or an existing one
/// being put in. Two rows, not a picker, because the ADR treats "add" and
/// "put in" as different verbs and a single button would blur them back
/// together.
internal struct InventoryContainerAddSheet: View {
    internal let containerName: String
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        dismiss()
                    } label: {
                        Label("Create new item", systemImage: InventorySymbol.addNew.system)
                    }
                    .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                    Button {
                        dismiss()
                    } label: {
                        Label(
                            "Pick existing item", systemImage: InventorySymbol.pickExisting.system)
                    }
                    .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                } footer: {
                    Text("Either way, it ends up in \(containerName).")
                }
            }
            .playgroundInsetGroupedList()
            .navigationTitle("Add to \(containerName)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .tint(.popsInventory)
    }
}
