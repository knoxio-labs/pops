import AppCore
import DesignSystem
import SwiftUI

/// Turns a route into its screen.
///
/// Every route the dashboard links to already resolves here, so a link never
/// lands on a blank page. Item detail, containers, locations, the items
/// browser, In hand, and Sync and repair have moved; the scanner (POPS-4078)
/// has not. Until it lands its route shows a pending screen. Recent activity
/// has no approved design at all; the playground draws the same pending
/// screen for it. The Inventory tab's stack and a routed `pops://` reference
/// (`InventoryEntityView`) both resolve their routes here.
internal struct InventoryDestinationView: View {
    internal let route: InventoryRoute
    internal let store: any InventoryStore

    @ViewBuilder internal var body: some View {
        switch route {
        case .items:
            InventoryItemsBrowserView(store: store)
        case .inHand:
            InventoryInHandView(store: store)
        case .item(let id):
            InventoryItemDetailScreen(itemId: id, store: store)
        case .syncRepair:
            InventorySyncView(model: InventorySyncViewModel(store: store))
        case .repair(let id):
            InventoryRepairScreen(repairId: id, store: store)
        case .container(let id):
            InventoryContainerPage(model: InventoryContainerPageModel(id: id, store: store))
        case .locations:
            InventoryLocationBrowserView(model: InventoryLocationBrowserModel(store: store))
        case .place(let id):
            InventoryLocationPage(model: InventoryLocationPageModel(id: id, store: store))
        case .containers:
            InventoryContainerBrowserView(model: InventoryContainerBrowserModel(store: store))
        default:
            InventoryPendingScreen(title: title, detail: detail, symbol: symbol)
        }
    }

    private var title: String {
        switch route {
        case .items: "Items"
        case .containers: "Containers"
        case .locations: "Locations"
        case .inHand: "In hand"
        case .activity: "Recent activity"
        case .syncRepair: "Sync"
        case .scan: "Scan a label"
        case .item: "Item"
        case .container: "Container"
        case .place: "Location"
        case .repair: "Repair"
        }
    }

    private var detail: String {
        switch route {
        case .items: "The complete item catalogue opens here."
        case .containers: "All open and closed containers open here."
        case .locations: "The complete place hierarchy opens here."
        case .inHand: "Everything picked up and not put anywhere yet opens here."
        case .activity: "The complete movement and edit history opens here."
        case .syncRepair: "Pending changes, conflicts, and repair actions open here."
        case .scan: "Camera opens here and accepts a container or item label."
        case .item: "The item detail opens here."
        case .container: "The container opens here."
        case .place: "The place opens here."
        case .repair: "The repair opens here."
        }
    }

    private var symbol: String {
        switch route {
        case .items, .item: "cube"
        case .containers, .container: "shippingbox"
        case .locations, .place: "house"
        case .inHand: "hand.raised"
        case .activity: "clock.arrow.circlepath"
        case .syncRepair, .repair: "arrow.trianglehead.2.clockwise.rotate.90"
        case .scan: "barcode.viewfinder"
        }
    }
}

/// A screen that has not moved into this package yet, drawn the way the
/// design playground draws a route it has no surface for.
internal struct InventoryPendingScreen: View {
    internal let title: String
    internal let detail: String
    internal let symbol: String

    internal var body: some View {
        List {
            Section {
                Label(detail, systemImage: symbol)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
        }
        .navigationTitle(title)
    }
}
