import Foundation

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

    internal var detail: String {
        switch context {
        case .inHand(let origin, let updated):
            "From \(origin) · \(updated)"
        case .stored(let container, let location):
            "\(container) · \(location)"
        }
    }
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

internal struct InventoryDashboardFixture {
    internal let summary: String
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
    internal static let containers = [
        InventoryContainer(
            id: "kitchen-12", name: "Kitchen 12", location: "Kitchen", itemCount: 18,
            updated: "8 min ago"),
        InventoryContainer(
            id: "office-04", name: "Office 04", location: "Study", itemCount: 11,
            updated: "Yesterday"),
        InventoryContainer(
            id: "garage-tools", name: "Garage tools", location: "Garage", itemCount: 24,
            updated: "Monday"),
    ]

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
            id: "closed-linen", title: "Linen 02 closed", detail: "19 items · Yesterday",
            symbol: "shippingbox.fill"),
        InventoryActivity(
            id: "added-drill", title: "Cordless drill added", detail: "Garage tools · Monday",
            symbol: "plus"),
    ]

    internal static let packing = InventoryDashboardFixture(
        summary: "3 containers open · 2 items in hand",
        containers: containers,
        inHand: Array(items.prefix(2)),
        recentItems: Array(items.suffix(2)),
        activity: activity,
        sync: .current,
        isFirstRun: false,
        isMoving: true
    )

    internal static let settled = InventoryDashboardFixture(
        summary: "846 items · 38 containers · 9 locations",
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
