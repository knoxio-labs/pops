import DesignSystem
import SwiftUI

/// One place something could go: a container, a location, a location made
/// from the picker a moment ago, or back where it came from.
internal struct InventoryDestination: Identifiable, Hashable {
    internal enum Kind: Hashable {
        case container
        case closedContainer
        case location
        case newLocation
        case putBack
    }

    internal let id: String
    internal let name: String
    internal let kind: Kind
    internal let detail: String?
    internal let count: Int?
    internal let placeKind: InventoryPlaceKind?

    internal init(
        id: String, name: String, kind: Kind, detail: String? = nil, count: Int? = nil,
        placeKind: InventoryPlaceKind? = nil
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.detail = detail
        self.count = count
        self.placeKind = placeKind
    }

    internal init(place: InventoryLocationNode, in tree: InventoryLocationTree) {
        let path = tree.parentPath(of: place.id)
        let items = tree.tally(of: place.id).items
        self.init(
            id: place.id, name: place.name, kind: .location,
            detail: path.isEmpty ? Self.rootDetail(place) : path,
            count: items == 0 ? nil : items,
            placeKind: place.kind)
    }

    internal init(container: InventoryPlacedContainer, at place: InventoryLocationNode) {
        self.init(
            id: container.id, name: container.name,
            kind: container.isOpen ? .container : .closedContainer,
            detail: place.name,
            count: container.contents.isEmpty ? nil : container.contents.count)
    }

    internal var isContainer: Bool { kind == .container || kind == .closedContainer }

    private static func rootDetail(_ place: InventoryLocationNode) -> String? {
        place.kind.title == place.name ? nil : place.kind.title
    }

    internal var symbol: String {
        switch kind {
        case .container: InventorySymbol.openContainer.system
        case .closedContainer: InventorySymbol.closedContainer.system
        case .location: placeKind?.symbol ?? InventorySymbol.location.system
        case .newLocation: InventorySymbol.location.system
        case .putBack: InventorySymbol.restore.system
        }
    }

    internal var tone: Color {
        switch kind {
        case .container: .popsWarning
        case .closedContainer, .location, .newLocation: .popsMutedForeground
        case .putBack: .popsSuccess
        }
    }
}

/// The one placement picker: move, put back, create and store all open it.
///
/// Put back first when there is somewhere to go back to, then recent places,
/// the open containers in the dashboard's amber panel, then the places,
/// drilled into one level at a time with New place at the end of each level.
/// A row selects; its chevron goes a level deeper; the bar commits.
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

    internal init(
        itemName: String,
        recent: [InventoryDestination],
        containers: [InventoryDestination],
        locations: [InventoryDestination],
        onChoose: @escaping (InventoryDestination) -> Void
    ) {
        self.init(
            title: itemName,
            tree: InventoryLocationTree(
                nodes: locations.map {
                    InventoryLocationNode(id: $0.id, name: $0.name, kind: $0.placeKind ?? .room)
                }),
            recent: recent, containers: containers, onChoose: onChoose)
    }

    private var working: InventoryLocationTree {
        InventoryLocationTree(nodes: tree.nodes + created)
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
            putBack: putBack, recent: recent, containers: containers,
            query: $query, filter: $filter, selection: $selection, drafting: $drafting,
            onCreate: create
        )
        .navigationTitle(id.flatMap { working.node($0)?.name } ?? title)
        .playgroundTitleDisplay(large: false)
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
            .playgroundProminentGlassButton()
            .tint(.popsInventory)
            .disabled(selection == nil)
        }
    }

    private func create(name: String, parentID: String?) {
        let node = InventoryLocationNode(
            id: "new-\(created.count)-\(name)", name: name, parentID: parentID)
        created.append(node)
        drafting = nil
        selection = InventoryDestination(
            id: node.id, name: name, kind: .newLocation,
            detail: working.parentPath(of: node.id))
    }
}

/// Where a staged picker opens: how deep, what is typed, what is picked.
internal struct InventoryDestinationPickerState {
    internal var path: [String] = []
    internal var query = ""
    internal var filter = InventoryDestinationFilter.everywhere
    internal var selection: InventoryDestination?
    internal var drafting: String?
    internal var isLoading = false
}

/// What the picker's filter circle narrows the top level to.
internal enum InventoryDestinationFilter: String, CaseIterable, Identifiable {
    case everywhere
    case places
    case containers
    case openContainers

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .everywhere: "Everywhere"
        case .places: "Places only"
        case .containers: "Containers only"
        case .openContainers: "Open containers"
        }
    }

    internal var symbol: String {
        switch self {
        case .everywhere: "square.grid.2x2"
        case .places: InventorySymbol.location.system
        case .containers: InventorySymbol.closedContainer.system
        case .openContainers: InventorySymbol.openContainer.system
        }
    }

    internal var showsPlaces: Bool { self == .everywhere || self == .places }
}
