import DesignSystem
import SwiftUI

/// The one placement picker's sheet: move, put back, create and store all
/// open it.
///
/// Put back first when there is somewhere to go back to, then recent places,
/// the open containers in the dashboard's amber panel, then the places,
/// drilled into one level at a time with New place at the end of each level.
/// A row selects; its chevron goes a level deeper; the bar commits.
///
/// This view only chooses. What choosing does is the caller's: the placement
/// picker entry point (`InventoryPlacementPicker.swift`) turns the choice
/// into commands, and the new-place form keeps it as a parent.
internal struct InventoryDestinationPickerSheet: View {
    internal let title: String
    internal let commitTitle: String
    internal let tree: InventoryLocationTree
    internal let putBack: InventoryDestination?
    internal let recent: [InventoryDestination]
    internal let containers: [InventoryDestination]
    internal let offered: Set<String>?
    internal let effect: (InventoryDestination) -> String?
    internal let isLoading: Bool
    internal let onChoose: (InventoryDestination) -> Void
    @State private var path: [String]
    @State private var query: String
    @State private var filter: InventoryDestinationFilter
    @State private var selection: InventoryDestination?
    @State private var drafting: String?
    @State private var created: [InventoryLocationNode] = []
    @Environment(\.dismiss) private var dismiss

    internal init(
        title: String,
        commitTitle: String = "Move",
        tree: InventoryLocationTree,
        putBack: InventoryDestination? = nil,
        recent: [InventoryDestination] = [],
        containers: [InventoryDestination] = [],
        offered: Set<String>? = nil,
        effect: @escaping (InventoryDestination) -> String? = { _ in nil },
        state: InventoryDestinationPickerState = InventoryDestinationPickerState(),
        onChoose: @escaping (InventoryDestination) -> Void = { _ in }
    ) {
        self.title = title
        self.commitTitle = commitTitle
        self.tree = tree
        self.putBack = putBack
        self.recent = recent
        self.containers = containers
        self.offered = offered
        self.effect = effect
        self.isLoading = state.isLoading
        self.onChoose = onChoose
        _path = State(initialValue: state.path)
        _query = State(initialValue: state.query)
        _filter = State(initialValue: state.filter)
        _selection = State(initialValue: state.selection)
        _drafting = State(initialValue: state.drafting)
    }

    private var working: InventoryLocationTree {
        InventoryLocationTree(nodes: tree.nodes + created)
    }

    private var pending: [String: InventoryDestination] {
        Dictionary(
            uniqueKeysWithValues: created.map { node in
                (
                    node.id,
                    InventoryDestination(
                        id: node.id, name: node.name, kind: .newLocation(parentID: node.parentID),
                        detail: working.parentPath(of: node.id))
                )
            })
    }

    internal var body: some View {
        NavigationStack(path: $path) {
            level(nil)
                .navigationDestination(for: String.self) { level($0) }
        }
        .tint(.popsInventory)
    }

    private func level(_ id: String?) -> some View {
        InventoryDestinationLevel(
            tree: working, levelID: id, offered: offered,
            effect: selection.flatMap(effect), isLoading: isLoading,
            putBack: putBack, recent: recent, containers: containers, pending: pending,
            query: $query, filter: $filter, selection: $selection, drafting: $drafting,
            onCreate: create
        )
        .navigationTitle(id.flatMap { working.node($0)?.name } ?? title)
        .popsTitleDisplay(large: false)
        .toolbar { toolbar(isRoot: id == nil) }
    }

    @ToolbarContentBuilder
    private func toolbar(isRoot: Bool) -> some ToolbarContent {
        if isRoot {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button(commitTitle) {
                guard let selection else { return }
                onChoose(selection)
                dismiss()
            }
            .inventoryProminentGlassButton()
            .tint(.popsInventory)
            .disabled(selection == nil)
        }
    }

    /// A new place lives only in this sheet until the bar commits it, so
    /// Cancel leaves nothing behind. Its id here is local to the sheet.
    private func create(name: String, parentID: String?) {
        let node = InventoryLocationNode(
            id: "new-\(created.count)-\(name)", name: name, parentID: parentID)
        created.append(node)
        drafting = nil
        selection = pending[node.id]
    }
}
