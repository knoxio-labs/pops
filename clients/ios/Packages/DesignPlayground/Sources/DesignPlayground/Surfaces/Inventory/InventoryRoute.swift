import DesignSystem
import SwiftUI

internal enum InventoryRoute: Hashable {
    case search
    case scan
    case items
    case containers
    case locations
    case inHand
    case container(String)
    case item(String)
    case place(String)
    case activity
    case syncRepair

    /// Where an item or container row opens.
    internal static func record(_ record: InventorySearchRecord) -> InventoryRoute {
        record.kind == .container ? .container(record.id) : .item(record.id)
    }
}

extension View {
    /// Registers the Inventory routes, unless the screen is already inside a
    /// stack that has.
    @ViewBuilder
    internal func inventoryDestinations(_ registers: Bool) -> some View {
        if registers {
            navigationDestination(for: InventoryRoute.self) { InventoryDestinationView(route: $0) }
        } else {
            self
        }
    }
}

internal struct InventoryDestinationView: View {
    internal let route: InventoryRoute

    @ViewBuilder internal var body: some View {
        switch route {
        case .items:
            InventoryItemsBrowserView(registersDestinations: false)
        case .search:
            UniversalSearchScreen(
                stage: UniversalSearchStage(scope: .pillar(.inventory)),
                registersDestinations: false)
        case .containers:
            InventoryContainerBrowserView(profiles: InventoryContainerFixtures.all)
        case .locations:
            InventoryLocationBrowserView(tree: InventoryLocationFixtures.home)
        case .scan:
            InventoryScanView()
        case .inHand:
            InventoryInHandView(items: InventoryRetrievalFixtures.many)
        case .item(let id):
            itemDetail(id)
        case .container(let id):
            if let profile = InventoryContainerFixtures.catalogue.first(where: { $0.id == id }) {
                InventoryContainerPage(profile: profile)
            } else {
                itemDetail(id)
            }
        case .place(let id):
            InventoryLocationPage(tree: InventorySearchFixtures.places, locationID: id)
        case .syncRepair:
            InventorySyncView(
                connection: .online(lastSynced: "4 min ago"),
                ledger: InventorySyncLedger(
                    repairs: InventorySyncFixtures.repairs,
                    resolved: InventorySyncFixtures.resolved),
                registersDestinations: false)
        case .activity:
            placeholder
        }
    }

    @ViewBuilder private func itemDetail(_ id: String) -> some View {
        if let record = InventorySearchFixtures.record(id: id) {
            InventoryItemDetailView(
                detail: InventoryItemDetail(
                    item: record.item,
                    photos: record.photo.map {
                        [InventoryPhoto(caption: record.item.name, isBroken: false, imageData: $0)]
                    } ?? []))
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
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
        case .inHand: "In hand"
        case .container(let id): id.replacingOccurrences(of: "-", with: " ").capitalized
        case .item(let id), .place(let id): id.replacingOccurrences(of: "-", with: " ").capitalized
        case .activity: "Recent activity"
        case .syncRepair: "Sync"
        }
    }

    private var detail: String {
        switch route {
        case .search: "Search names, labels, containers, and locations."
        case .scan: "Camera opens here and accepts a container or item label."
        case .items: "The complete item catalogue opens here."
        case .containers: "All open and closed containers open here."
        case .locations: "The complete place hierarchy opens here."
        case .inHand: "Everything picked up and not put anywhere yet opens here."
        case .container: "The container opens here without replacing the Inventory tab stack."
        case .item: "The item detail opens here without replacing the Inventory tab stack."
        case .place: "The place opens here."
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
        case .locations, .place: "house"
        case .inHand: InventorySymbol.inHand.system
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
        case .inHand: "inventory/in-hand"
        case .container(let id): "inventory/containers/\(id)"
        case .item(let id): "inventory/items/\(id)"
        case .place(let id): "inventory/locations/\(id)"
        case .activity: "inventory/activity"
        case .syncRepair: "inventory/sync-repair"
        }
    }
}
