import Testing

@testable import DesignPlayground

/// What a container's contents count to, and when it can stop being one.
@Suite("Inventory container contents")
internal struct InventoryContainerContentsTests {
    private func item(_ id: String, quantity: Int = 1) -> InventoryFoundationItem {
        InventoryFoundationItem(
            id: id, name: id, typeName: "Thing", quantity: quantity,
            placement: .direct(location: "Garage"))
    }

    @Test("item count and unit count diverge once a quantity is more than one")
    func countsDiverge() {
        let contents = InventoryContainerContents(
            items: [item("screws", quantity: 120), item("cable")])

        #expect(contents.itemCount == 2)
        #expect(contents.unitCount == 121)
    }

    @Test("an exhausted quantity contributes nothing negative to the unit total")
    func exhaustedQuantityFloorsAtZero() {
        let contents = InventoryContainerContents(items: [item("tape", quantity: 0)])

        #expect(contents.unitCount == 0)
    }

    @Test("searching matches by name and is empty-query safe")
    func searchMatchesByName() {
        let contents = InventoryContainerContents(
            items: [item("espresso-machine"), item("cable")])

        #expect(contents.matching("").count == 2)
        #expect(contents.matching("espresso").map(\.id) == ["espresso-machine"])
        #expect(contents.matching("nothing-like-this").isEmpty)
    }

    @Test("disabling containment is offered only while the container is empty")
    func disableRequiresEmpty() {
        let full = InventoryContainerFixtures.full
        let empty = InventoryContainerFixtures.empty

        #expect(!full.canDisableContainment)
        #expect(empty.canDisableContainment)
    }

    @Test("enabling containment is offered only to an eligible non-container item")
    func enableRequiresEligibleNonContainer() {
        #expect(InventoryContainerFixtures.capabilityEligible.canEnableContainment)
        #expect(!InventoryContainerFixtures.empty.canEnableContainment)
    }
}

/// Which containers a "put in" can legally target, given the rule that a
/// container cannot end up inside itself or inside anything it already
/// contains.
@Suite("Inventory container packing")
internal struct InventoryContainerPackingTests {
    private func container(_ id: String) -> InventoryFoundationItem {
        InventoryFoundationItem(
            id: id, name: id, typeName: "Storage box", placement: .direct(location: "Garage"),
            access: .open)
    }

    @Test("a container is not offered as its own destination")
    func excludesSelf() {
        let crate = container("crate")
        let valid = InventoryContainerPacking.validDestinations(
            for: "crate", candidates: [crate], parents: [:])

        #expect(valid.isEmpty)
    }

    @Test("a container is not offered a destination that is already inside it")
    func excludesDescendants() {
        let outer = container("outer")
        let middle = container("middle")
        let inner = container("inner")
        // middle is inside outer, inner is inside middle: outer > middle > inner.
        let parents = ["middle": "outer", "inner": "middle"]

        let valid = InventoryContainerPacking.validDestinations(
            for: "outer", candidates: [outer, middle, inner], parents: parents)

        #expect(valid.isEmpty)
    }

    @Test("an unrelated container is still offered")
    func unrelatedContainerIsOffered() {
        let crate = container("crate")
        let sibling = container("sibling")
        let parents = ["sibling": "elsewhere"]

        let valid = InventoryContainerPacking.validDestinations(
            for: "crate", candidates: [crate, sibling], parents: parents)

        #expect(valid.map(\.id) == ["sibling"])
    }

    @Test("a plain item never qualifies as a destination")
    func nonContainersAreNeverOffered() {
        let plainItem = InventoryFoundationItem(
            id: "cable", name: "Cable", typeName: "Cable", placement: .direct(location: "Study"))

        let valid = InventoryContainerPacking.validDestinations(
            for: "a", candidates: [plainItem], parents: [:])

        #expect(valid.isEmpty)
    }
}
