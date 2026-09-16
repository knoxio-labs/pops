internal struct InventoryGroundedDashboardState {
    internal var containers: [InventoryContainer]
    internal var inHandItems: [InventoryItem]
    internal var activities: [InventoryActivity]

    internal init(fixture: InventoryDashboardFixture) {
        containers = fixture.containers
        inHandItems = fixture.inHand
        activities = fixture.activity
    }

    internal mutating func close(_ container: InventoryContainer) {
        containers.removeAll { $0.id == container.id }
    }

    internal mutating func putBack(_ item: InventoryItem) {
        inHandItems.removeAll { $0.id == item.id }
    }

    internal mutating func move(_ item: InventoryItem) {
        inHandItems.removeAll { $0.id == item.id }
    }

    internal mutating func undo(_ activity: InventoryActivity) {
        activities.removeAll { $0.id == activity.id }
    }
}
