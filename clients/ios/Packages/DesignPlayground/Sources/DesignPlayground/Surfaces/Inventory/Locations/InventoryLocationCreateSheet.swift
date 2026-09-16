import SwiftUI

/// Creating a place, with an explicit parent rather than whatever node
/// happened to be selected (POPS-45). Opened from the browser for a
/// top-level place, or from a location's detail for a sub-location, so
/// `presetParentID` starts the picker where the caller already was without
/// stopping it from being changed.
internal struct InventoryLocationCreateSheet: View {
    internal let tree: InventoryLocationTree
    internal let presetParentID: String?
    @State private var name = ""
    @State private var parentID: String?
    @Environment(\.dismiss) private var dismiss

    internal init(tree: InventoryLocationTree, presetParentID: String? = nil) {
        self.tree = tree
        self.presetParentID = presetParentID
        self._parentID = State(initialValue: presetParentID)
    }

    internal var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Name", text: $name)
                }
                Section("Parent") {
                    Picker("Parent", selection: $parentID) {
                        Text("No parent, top level").tag(String?.none)
                        ForEach(tree.nodes.sorted { $0.name < $1.name }) { node in
                            Text(
                                tree.breadcrumbs(for: node.id).map(\.name).joined(separator: " › ")
                            )
                            .tag(String?.some(node.id))
                        }
                    }
                    .pickerStyle(.menu)
                }
            }
            .navigationTitle("New place")
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button("Create") { dismiss() }.disabled(name.isEmpty)
                }
            }
        }
    }
}
