import SwiftUI

/// The location browser: top-level places down to a drawer.
///
/// Two independent open questions live in ``InventoryLocationStyle``: whether
/// the phone opens on the tree or on search, and whether going deeper
/// discloses inline or drills down to a new screen. Every row reads through
/// ``InventoryLocationTree/effectiveItemCount(of:)``, so what a row shows is
/// always what a location holds directly and through everything below it,
/// never one presented as the other.
internal struct InventoryLocationBrowserView: View {
    internal let tree: InventoryLocationTree
    internal let style: InventoryLocationStyle
    internal let notice: InventoryStateNoticeKind?
    @State private var query = ""
    @State private var expanded: Set<String> = []
    @State private var isCreating = false

    internal init(
        tree: InventoryLocationTree,
        style: InventoryLocationStyle,
        notice: InventoryStateNoticeKind? = nil
    ) {
        self.tree = tree
        self.style = style
        self.notice = notice
    }

    internal var body: some View {
        List {
            if let notice {
                InventoryStateNotice(kind: notice)
            }
            if tree.roots.isEmpty {
                InventoryStateNotice(kind: .empty)
                Button("Create a location") { isCreating = true }
            } else if style.navigation == .treeFirst {
                treeRows(for: tree.roots)
            } else {
                searchRows
            }
        }
        .searchable(text: $query, prompt: "Search locations")
        .navigationTitle("Locations")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New place", systemImage: InventorySymbol.create.system) {
                    isCreating = true
                }
            }
        }
        .sheet(isPresented: $isCreating) { InventoryLocationCreateSheet(tree: tree) }
    }

    private func treeRows(for nodes: [InventoryLocationNode]) -> some View {
        ForEach(nodes) { node in
            if style.disclosure == .inline {
                DisclosureGroup(isExpanded: expandedBinding(node.id)) {
                    AnyView(treeRows(for: tree.children(of: node.id)))
                } label: {
                    row(node)
                }
            } else {
                NavigationLink {
                    InventoryLocationDetailView(tree: tree, locationID: node.id, style: style)
                } label: {
                    row(node)
                }
            }
        }
    }

    @ViewBuilder private var searchRows: some View {
        let matches =
            query.isEmpty
            ? tree.nodes
            : tree.nodes.filter { $0.name.localizedCaseInsensitiveContains(query) }
        ForEach(matches.sorted { $0.name < $1.name }) { node in
            NavigationLink {
                InventoryLocationDetailView(tree: tree, locationID: node.id, style: style)
            } label: {
                row(node, showsPath: true)
            }
        }
    }

    private func row(_ node: InventoryLocationNode, showsPath: Bool = false) -> some View {
        let crumbs = tree.breadcrumbs(for: node.id)
        return InventoryLocationRow(
            name: node.name,
            parent: showsPath ? crumbs.dropLast().last?.name : nil,
            itemCount: tree.effectiveItemCount(of: node.id),
            containerCount: tree.effectiveContainerCount(of: node.id))
    }

    private func expandedBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { expanded.contains(id) },
            set: { isExpanded in
                if isExpanded {
                    expanded.insert(id)
                } else {
                    expanded.remove(id)
                }
            })
    }
}
