import AppCore
import DesignSystem
import SwiftUI

/// One place something could go: a container, a location, a location made
/// from the picker a moment ago, or back where it came from.
internal struct InventoryDestination: Identifiable, Hashable {
    internal enum Kind: Hashable {
        case container
        case closedContainer
        case location
        /// Named in the picker's New place row and not created yet: choosing
        /// it creates the place under `parentID`, then places into it.
        case newLocation(parentID: InventoryLocation.ID?)
        /// Back to the remembered previous placement, whatever it is. A
        /// closed container still takes things put back into it: closing a
        /// box stops new packing, not the return of what came out of it.
        case putBack(InventoryPlacement)
    }

    internal let id: String
    internal let name: String
    internal let kind: Kind
    internal let detail: String?
    internal let count: Int?

    internal init(
        id: String, name: String, kind: Kind, detail: String? = nil, count: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.detail = detail
        self.count = count
    }

    internal init(place: InventoryLocationNode, in tree: InventoryLocationTree) {
        let path = tree.parentPath(of: place.id)
        let items = tree.tally(of: place.id).items
        self.init(
            id: place.id, name: place.name, kind: .location,
            detail: path.isEmpty ? nil : path, count: items == 0 ? nil : items)
    }

    internal init(container: InventoryPlacedContainer, at place: InventoryLocationNode) {
        self.init(
            id: container.id, name: container.name,
            kind: container.isOpen ? .container : .closedContainer,
            detail: place.name,
            count: container.contents.isEmpty ? nil : container.contents.count)
    }

    internal var isContainer: Bool { kind == .container || kind == .closedContainer }

    internal var isLocation: Bool {
        switch kind {
        case .location, .newLocation: true
        case .container, .closedContainer, .putBack: false
        }
    }

    /// Where choosing this puts an item, once any new place exists. Nil only
    /// for a new place, whose id is minted when it is created.
    internal var placement: InventoryPlacement? {
        switch kind {
        case .container, .closedContainer: .container(id)
        case .location: .location(id)
        case .newLocation: nil
        case .putBack(let previous): previous
        }
    }

    internal var symbol: String {
        switch kind {
        case .container: InventorySymbol.openContainer.system
        case .closedContainer: InventorySymbol.closedContainer.system
        case .location, .newLocation: InventorySymbol.location.system
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

/// Where a picker opens: how deep, what is typed, what is picked.
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
