import Testing

@testable import DesignPlayground

/// The dashboard, the Containers browser and the Locations browser describe
/// one home. A reviewer moving between them reads their numbers side by side.
@Suite("Inventory fixture agreement")
@MainActor
internal struct InventoryFixtureAgreementTests {
    private let home = InventoryLocationFixtures.home
    private let profiles = InventoryContainerFixtures.all

    @Test("the dashboard's tiles count what the Locations browser counts")
    func dashboardTilesMatchLocations() {
        let total = home.total
        let catalogue = InventoryFixtures.packing.catalogue
        #expect(catalogue.locations == total.places)
        #expect(catalogue.containers == total.containers)
        #expect(catalogue.items == total.items)
        #expect(InventoryFixtures.settled.catalogue == catalogue)
    }

    @Test("every container the Containers browser lists sits in exactly one place")
    func containersArePlacedOnce() {
        let placed = home.nodes.flatMap(\.containers)
        #expect(placed.count == profiles.count)
        #expect(Set(placed.map(\.id)) == Set(profiles.map(\.id)))
        #expect(InventoryContainerStats(profiles).total == home.total.containers)
    }

    @Test("a container holds the same number of items on every screen")
    func containerCountsAgree() throws {
        let placed = home.nodes.flatMap(\.containers)
        for profile in profiles {
            let match = try #require(placed.first { $0.id == profile.id })
            #expect(match.contents.count == profile.contents.itemCount, "\(profile.id)")
            #expect(match.isOpen == profile.isOpen, "\(profile.id)")
        }
    }

    @Test("the dashboard's open containers are the open ones everywhere else")
    func openContainersAgree() {
        let dashboard = InventoryFixtures.containers
        let picker = InventoryLocationFixtures.openContainers
        let open = profiles.filter(\.isOpen)
        #expect(dashboard.map(\.id) == open.map(\.id))
        #expect(picker.map(\.id) == open.map(\.id))
        #expect(dashboard.map(\.itemCount) == open.map(\.contents.itemCount))
        #expect(picker.map(\.count) == open.map { Optional($0.contents.itemCount) })
        #expect(InventoryFixtures.packing.summary.hasPrefix("\(open.count) containers open"))
    }
}
