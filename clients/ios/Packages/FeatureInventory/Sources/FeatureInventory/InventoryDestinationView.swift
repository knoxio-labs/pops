import AppCore
import DesignSystem
import SwiftUI

/// Turns a route into its screen.
///
/// Every route the dashboard links to resolves here to its own screen, so a
/// link never lands on a blank page. The Inventory tab's stack and a routed
/// `pops://` reference (`InventoryEntityView`) both resolve their routes here.
internal struct InventoryDestinationView: View {
    internal let route: InventoryRoute
    internal let store: any InventoryStore
    internal let entityRouter: any EntityRouter

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
            InventoryContainerPage(id: id, store: store)
        case .locations:
            InventoryLocationBrowserView(model: InventoryLocationBrowserModel(store: store))
        case .place(let id):
            InventoryLocationPage(model: InventoryLocationPageModel(id: id, store: store))
        case .containers:
            InventoryContainerBrowserView(model: InventoryContainerBrowserModel(store: store))
        case .openContainers:
            InventoryOpenContainersView(model: InventoryOpenContainersModel(store: store))
        case .scan:
            InventoryScanScreen(store: store, entityRouter: entityRouter)
        case .activity:
            InventoryRecentActivityView(model: InventoryRecentActivityModel(store: store))
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
