import AppCore
import Testing

/// `InventoryPlacementTrail` is what a query hands back after walking a
/// placement's container chain (ADR-002 D2); these pin `effectiveLocation`
/// and `crumbs` for the three shapes that walk can end in.
@Suite("Inventory placement trail")
internal struct InventoryPlacementTrailTests {
    @Test("a direct placement's effective location is itself, with one crumb")
    func direct() {
        let trail = InventoryPlacementTrail.direct(location: "loc-garage")

        #expect(trail.effectiveLocation == "loc-garage")
        #expect(trail.crumbs == ["loc-garage"])
        #expect(trail.containingItem == nil)
        #expect(trail.isInHand == false)
    }

    @Test("a contained placement's crumbs run from the location outward to the innermost container")
    func containedWithLocation() {
        let trail = InventoryPlacementTrail.contained(
            location: "loc-garage", containers: ["box-1", "box-2"])

        #expect(trail.effectiveLocation == "loc-garage")
        #expect(trail.containingItem == "box-2")
        #expect(trail.crumbs == ["loc-garage", "box-1", "box-2"])
    }

    /// D2: the outermost container can itself be unplaced, which is a real
    /// state ("no effective location") rather than missing data.
    @Test("a contained placement with no location has no effective location, but keeps its crumbs")
    func containedWithoutLocation() {
        let trail = InventoryPlacementTrail.contained(location: nil, containers: ["box-1"])

        #expect(trail.effectiveLocation == nil)
        #expect(trail.crumbs == ["box-1"])
    }

    @Test("in hand has no effective location and no crumbs")
    func inHand() {
        let trail = InventoryPlacementTrail.inHand(previous: .location("loc-office"))

        #expect(trail.effectiveLocation == nil)
        #expect(trail.crumbs.isEmpty)
        #expect(trail.isInHand)
    }

    @Test("a tombstoned previous placement is a distinct state from having none")
    func previousPlacementTombstoned() {
        let neverPlaced = InventoryPlacementTrail.inHand(previous: nil)
        let previousDeleted = InventoryPlacementTrail.inHand(previous: .tombstoned)

        #expect(neverPlaced != previousDeleted)
    }
}
