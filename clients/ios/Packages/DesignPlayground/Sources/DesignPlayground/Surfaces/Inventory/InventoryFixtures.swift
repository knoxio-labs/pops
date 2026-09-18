internal struct InventoryContainer: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let location: String
    internal let itemCount: Int
    internal let updated: String
}

internal struct InventoryItem: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let context: InventoryItemContext
    internal let symbol: String
}

internal enum InventoryItemContext: Equatable {
    case inHand(origin: String, updated: String)
    case stored(container: String, location: String)
}

internal struct InventoryActivity: Identifiable, Equatable {
    internal let id: String
    internal let title: String
    internal let detail: String
    internal let symbol: String
}

internal enum InventorySyncState: Equatable {
    case current
    case offline(updated: String)
    case synchronizing(progress: String)
    case needsAttention(count: Int)
}

internal struct InventoryCatalogueCounts: Equatable {
    internal let items: Int
    internal let containers: Int
    internal let locations: Int
}

internal struct InventoryDashboardFixture {
    internal let summary: String
    internal let catalogue: InventoryCatalogueCounts
    internal let containers: [InventoryContainer]
    internal let inHand: [InventoryItem]
    internal let recentItems: [InventoryItem]
    internal let activity: [InventoryActivity]
    internal let sync: InventorySyncState
    internal let isFirstRun: Bool
    internal let isMoving: Bool
}

@MainActor
internal enum InventoryFixtures {
    internal static let containers = InventoryContainerFixtures.all.filter(\.isOpen).map {
        InventoryContainer(
            id: $0.id, name: $0.item.name,
            location: $0.item.placement.effectiveLocation ?? "",
            itemCount: $0.contents.itemCount, updated: $0.updated)
    }

    /// The same catalogue the Containers and Locations screens are drawn from.
    internal static let catalogue: InventoryCatalogueCounts = {
        let total = InventoryLocationFixtures.home.total
        return InventoryCatalogueCounts(
            items: total.items, containers: total.containers, locations: total.places)
    }()

    internal static let items = [
        InventoryItem(
            id: "passport", name: "Passport",
            context: .inHand(origin: "Documents drawer", updated: "8 min ago"),
            symbol: "person.text.rectangle"),
        InventoryItem(
            id: "router", name: "Wi-Fi router",
            context: .inHand(origin: "Office 04", updated: "12 min ago"),
            symbol: "wifi.router"),
        InventoryItem(
            id: "drill", name: "Cordless drill",
            context: .stored(container: "Garage tools", location: "Garage"),
            symbol: "wrench.and.screwdriver"),
        InventoryItem(
            id: "plates", name: "Everyday plates",
            context: .stored(container: "Kitchen 12", location: "Kitchen"),
            symbol: "fork.knife"),
    ]

    internal static let activity = [
        InventoryActivity(
            id: "moved-router", title: "Wi-Fi router moved",
            detail: "Office 04 → In hand · 12 min ago",
            symbol: "arrow.right"),
        InventoryActivity(
            id: "closed-linen", title: "Linen 02 closed",
            detail: "\(InventoryContainerFixtures.closed.contents.itemCount) items · Yesterday",
            symbol: "shippingbox.fill"),
        InventoryActivity(
            id: "added-drill", title: "Cordless drill added", detail: "Garage tools · Monday",
            symbol: "plus"),
    ]

    internal static let packing = InventoryDashboardFixture(
        summary: "\(containers.count) containers open · 2 items in hand",
        catalogue: catalogue,
        containers: containers,
        inHand: Array(items.prefix(2)),
        recentItems: Array(items.suffix(2)),
        activity: activity,
        sync: .current,
        isFirstRun: false,
        isMoving: true
    )

    internal static let settled = InventoryDashboardFixture(
        summary:
            "\(catalogue.items) items · \(catalogue.containers) containers · "
            + "\(catalogue.locations) locations",
        catalogue: catalogue,
        containers: [],
        inHand: [],
        recentItems: Array(items.reversed()),
        activity: Array(activity.suffix(2)),
        sync: .current,
        isFirstRun: false,
        isMoving: false
    )

    internal static let firstRun = InventoryDashboardFixture(
        summary: "No local catalogue yet",
        catalogue: InventoryCatalogueCounts(items: 0, containers: 0, locations: 0),
        containers: [],
        inHand: [],
        recentItems: [],
        activity: [],
        sync: .current,
        isFirstRun: true,
        isMoving: false
    )

    internal static func packing(openContainers: Int) -> InventoryDashboardFixture {
        InventoryDashboardFixture(
            summary: openContainers == 0 ? "No containers open · 2 items in hand" : packing.summary,
            catalogue: packing.catalogue,
            containers: Array(containers.prefix(openContainers)),
            inHand: packing.inHand,
            recentItems: packing.recentItems,
            activity: packing.activity,
            sync: packing.sync,
            isFirstRun: false,
            isMoving: true
        )
    }

    internal static func withSync(
        _ sync: InventorySyncState, base: InventoryDashboardFixture = packing
    ) -> InventoryDashboardFixture {
        InventoryDashboardFixture(
            summary: base.summary,
            catalogue: base.catalogue,
            containers: base.containers,
            inHand: base.inHand,
            recentItems: base.recentItems,
            activity: base.activity,
            sync: sync,
            isFirstRun: base.isFirstRun,
            isMoving: base.isMoving
        )
    }
}
