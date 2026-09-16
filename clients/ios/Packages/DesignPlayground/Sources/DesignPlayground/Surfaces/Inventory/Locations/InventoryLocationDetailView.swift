import SwiftUI

/// A location's detail: what it holds directly, what it holds through
/// containers and sub-locations, and the one destructive action, each
/// stating its effect before it is taken.
internal struct InventoryLocationDetailView: View {
    internal let tree: InventoryLocationTree
    internal let locationID: String
    internal let style: InventoryLocationStyle
    @State private var confirmingDelete = false
    @State private var isRenaming = false
    @State private var isCreatingChild = false
    @State private var isReparenting = false
    @State private var renamedName = ""

    private var node: InventoryLocationNode? { tree.node(locationID) }

    internal var body: some View {
        List {
            if let node {
                breadcrumbSection(node)
                contentsSections(node)
                childrenSection(node)
                Section {
                    Button("Delete location", role: .destructive) { confirmingDelete = true }
                }
            } else {
                InventoryStateNotice(kind: .unavailable)
            }
        }
        .navigationTitle(node?.name ?? "Location")
        .toolbar { if let node { managementToolbar(node) } }
        .confirmationDialog(
            "Delete \(node?.name ?? "this location")?",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete and move contents up", role: .destructive) {}
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(deleteImpact(node))
        }
        .modifier(ManagementSheets(view: self))
    }

    /// The rename alert and the two sheets management opens, held off `body`
    /// so it stays under the function-length budget.
    private struct ManagementSheets: ViewModifier {
        let view: InventoryLocationDetailView

        func body(content: Content) -> some View {
            content
                .alert("Rename", isPresented: view.$isRenaming) {
                    TextField("Name", text: view.$renamedName)
                    Button("Save") {}
                    Button("Cancel", role: .cancel) {}
                }
                .sheet(isPresented: view.$isCreatingChild) {
                    InventoryLocationCreateSheet(
                        tree: view.tree, presetParentID: view.locationID)
                }
                .sheet(isPresented: view.$isReparenting) {
                    InventoryLocationPickerView(
                        tree: view.tree, style: view.style, itemName: view.node?.name ?? "location",
                        excludedIDs: Set(
                            view.tree.descendants(of: view.locationID).map(\.id)
                                + [view.locationID]))
                }
        }
    }

    @ToolbarContentBuilder
    private func managementToolbar(_ node: InventoryLocationNode) -> some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Menu {
                Button("Rename", systemImage: InventorySymbol.rename.system) {
                    renamedName = node.name
                    isRenaming = true
                }
                Button("Move", systemImage: InventorySymbol.move.system) { isReparenting = true }
                Button("Add sub-location", systemImage: InventorySymbol.create.system) {
                    isCreatingChild = true
                }
            } label: {
                Label("Manage", systemImage: InventorySymbol.manage.system)
            }
        }
    }

    private func breadcrumbSection(_ node: InventoryLocationNode) -> some View {
        let path = tree.breadcrumbs(for: node.id).map(\.name).joined(separator: " › ")
        return Section { InventoryPlacementPath(placement: .direct(location: path)) }
    }

    @ViewBuilder private func contentsSections(_ node: InventoryLocationNode) -> some View {
        let effectiveItems = tree.effectiveItemCount(of: node.id) - node.directItemCount
        let effectiveContainers =
            tree.effectiveContainerCount(of: node.id) - node.directContainerCount
        switch style.placementVisual {
        case .separateSection:
            Section("Directly here") {
                contentsRows(node.directItemCount, node.directContainerCount)
            }
            Section("Through containers and sub-locations") {
                contentsRows(effectiveItems, effectiveContainers)
            }
        case .inlineMarker:
            Section("Here, directly and through everything below it") {
                contentsRows(node.directItemCount, node.directContainerCount)
                Label(
                    "\(effectiveItems) items, \(effectiveContainers) containers, one level down or deeper",
                    systemImage: InventorySymbol.move.system)
            }
        case .toggle:
            Section("Directly here") {
                contentsRows(node.directItemCount, node.directContainerCount)
            }
            Section {
                NavigationLink("Show what's also here through containers and sub-locations") {
                    List { contentsRows(effectiveItems, effectiveContainers) }
                }
            }
        }
    }

    @ViewBuilder private func contentsRows(_ items: Int, _ containers: Int) -> some View {
        Label("\(items) items", systemImage: InventorySymbol.item.system)
        Label("\(containers) containers", systemImage: InventorySymbol.openContainer.system)
    }

    @ViewBuilder private func childrenSection(_ node: InventoryLocationNode) -> some View {
        let children = tree.children(of: node.id)
        if !children.isEmpty {
            Section("Sub-locations") {
                ForEach(children) { child in
                    NavigationLink(child.name) {
                        InventoryLocationDetailView(tree: tree, locationID: child.id, style: style)
                    }
                }
            }
        }
    }

    private func deleteImpact(_ node: InventoryLocationNode?) -> String {
        guard let node else { return "" }
        let items = tree.effectiveItemCount(of: node.id)
        let containers = tree.effectiveContainerCount(of: node.id)
        let subLocations = tree.descendants(of: node.id).count
        guard items + containers + subLocations > 0 else {
            return "Nothing is here. Deleting removes only this location."
        }
        let target = tree.breadcrumbs(for: node.id).dropLast().last?.name ?? "no location"
        return
            "\(items) items, \(containers) containers, and \(subLocations) sub-locations move up "
            + "to \(target)."
    }
}
