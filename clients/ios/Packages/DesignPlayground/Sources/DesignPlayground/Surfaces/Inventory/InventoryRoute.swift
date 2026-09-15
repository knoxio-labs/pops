import DesignSystem
import SwiftUI

internal enum InventoryRoute: Hashable {
    case search
    case scan
    case items
    case containers
    case locations
    case container(String)
    case item(String)
    case activity
    case syncRepair
}

internal struct InventoryDestinationView: View {
    internal let route: InventoryRoute

    internal var body: some View {
        List {
            Section {
                Label(detail, systemImage: symbol)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            } footer: {
                Text("Named route: \(routeName)")
            }
        }
        .navigationTitle(title)
    }

    private var title: String {
        switch route {
        case .search: "Search inventory"
        case .scan: "Scan a label"
        case .items: "Items"
        case .containers: "Containers"
        case .locations: "Locations"
        case .container(let id): id.replacingOccurrences(of: "-", with: " ").capitalized
        case .item(let id): id.replacingOccurrences(of: "-", with: " ").capitalized
        case .activity: "Recent activity"
        case .syncRepair: "Sync & repair"
        }
    }

    private var detail: String {
        switch route {
        case .search: "Search names, labels, containers, and locations."
        case .scan: "Camera opens here and accepts a container or item label."
        case .items: "The complete item catalogue opens here."
        case .containers: "All open and closed containers open here."
        case .locations: "The complete place hierarchy opens here."
        case .container: "The container opens here without replacing the Inventory tab stack."
        case .item: "The item detail opens here without replacing the Inventory tab stack."
        case .activity: "The complete movement and edit history opens here."
        case .syncRepair: "Pending changes, conflicts, and repair actions open here."
        }
    }

    private var symbol: String {
        switch route {
        case .search: "magnifyingglass"
        case .scan: "barcode.viewfinder"
        case .items, .item: "cube"
        case .containers, .container: "shippingbox"
        case .locations: "house"
        case .activity: "clock.arrow.circlepath"
        case .syncRepair: "arrow.trianglehead.2.clockwise.rotate.90"
        }
    }

    private var routeName: String {
        switch route {
        case .search: "inventory/search"
        case .scan: "inventory/scan"
        case .items: "inventory/items"
        case .containers: "inventory/containers"
        case .locations: "inventory/locations"
        case .container(let id): "inventory/containers/\(id)"
        case .item(let id): "inventory/items/\(id)"
        case .activity: "inventory/activity"
        case .syncRepair: "inventory/sync-repair"
        }
    }
}
