import Testing

@testable import DesignPlayground

/// POPS-3985's hierarchy logic: what a location holds directly versus
/// through what is below it, and the order a destination chooser offers.
@Suite("Inventory location hierarchy")
internal struct InventoryLocationHierarchyTests {
    private typealias Fixtures = InventoryLocationFixtures

    @Test("effective counts add every descendant's direct counts, not just one level down")
    func effectiveCountsFollowTheWholeSubtree() {
        let tree = Fixtures.small
        #expect(tree.effectiveItemCount(of: "garage") == 4 + 12)
        #expect(tree.effectiveContainerCount(of: "garage") == 2 + 1)
    }

    @Test("a leaf's effective counts equal its own direct counts")
    func leafEffectiveCountsAreItsOwnDirectCounts() {
        let tree = Fixtures.small
        #expect(tree.effectiveItemCount(of: "garage-tools") == 12)
        #expect(tree.effectiveContainerCount(of: "garage-tools") == 1)
    }

    @Test("an unknown location has no counts at all, rather than crashing")
    func unknownLocationHasZeroCounts() {
        let tree = Fixtures.small
        #expect(tree.effectiveItemCount(of: "attic") == 0)
        #expect(tree.effectiveContainerCount(of: "attic") == 0)
    }

    @Test("breadcrumbs run room first, ending at the location itself")
    func breadcrumbsRunFromRootToTarget() {
        let names = Fixtures.small.breadcrumbs(for: "garage-tools").map(\.name)
        #expect(names == ["Home", "Garage", "Garage tools shelf"])
    }

    @Test("a location is its own descendant, and everything below it is too")
    func isDescendantIncludesSelfAndBelow() {
        let tree = Fixtures.small
        #expect(tree.isDescendant("garage", of: "garage"))
        #expect(tree.isDescendant("garage-tools", of: "garage"))
        #expect(!tree.isDescendant("study", of: "garage"))
    }

    @Test("the destination chooser orders recent, then favourite, then containers, then the rest")
    func chooserOrdersByTier() {
        let options = InventoryDestinationChooser.options(
            tree: Fixtures.small,
            recentIDs: ["garage-tools"],
            favoriteIDs: ["hall-cupboard"],
            openContainers: [("crate-3", "Moving crate 3")])
        #expect(
            options.map(\.id) == [
                "garage-tools", "hall-cupboard", "crate-3", "garage", "home", "study",
            ])
        let kinds: [InventoryDestinationOption.Kind] = [
            .recentLocation, .favoriteLocation, .openContainer, .location, .location, .location,
        ]
        #expect(options.map(\.kind) == kinds)
    }

    @Test("an id already placed in a higher tier does not repeat in a lower one")
    func chooserDeduplicatesAcrossTiers() {
        let options = InventoryDestinationChooser.options(
            tree: Fixtures.small,
            recentIDs: ["garage"],
            favoriteIDs: ["garage"])
        #expect(options.filter { $0.id == "garage" }.count == 1)
        #expect(options.first?.kind == .recentLocation)
    }

    @Test("excluded ids never appear, which is how a reparent avoids offering its own subtree")
    func chooserExcludesGivenIDs() {
        let options = InventoryDestinationChooser.options(
            tree: Fixtures.small,
            excluding: Set(Fixtures.small.descendants(of: "garage").map(\.id) + ["garage"]))
        #expect(!options.contains { $0.id == "garage" || $0.id == "garage-tools" })
        #expect(options.contains { $0.id == "study" })
    }
}
