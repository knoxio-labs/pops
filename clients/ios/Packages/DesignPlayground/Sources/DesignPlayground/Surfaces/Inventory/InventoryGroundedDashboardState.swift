internal struct InventoryGroundedDashboardState {
    internal var containers: [InventoryContainer]
    internal var inHand: InventoryInHandList
    internal var activities: [InventoryActivity]

    internal init(fixture: InventoryDashboardFixture) {
        containers = fixture.containers
        inHand = InventoryInHandList(InventoryRetrievalFixtures.dashboard(fixture.inHand))
        activities = fixture.activity
    }

    internal mutating func close(_ container: InventoryContainer) {
        containers.removeAll { $0.id == container.id }
    }

    internal mutating func undo(_ activity: InventoryActivity) {
        activities.removeAll { $0.id == activity.id }
    }
}
