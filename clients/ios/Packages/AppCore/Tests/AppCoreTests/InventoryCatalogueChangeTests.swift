import AppCore
import Testing

/// The structured catalogue reason (POPS-4494): open on the wire, so a kind
/// this build has never heard of round-trips instead of being dropped, and a
/// repair knows whether this phone's fields moved since it opened.
@Suite("Inventory catalogue change")
internal struct InventoryCatalogueChangeTests {
    @Test("every known definition and change reads back as it was spelled")
    func knownKindsRoundTrip() {
        let definitions = ["type", "field", "option", "revision"]
        let changes = [
            "archived", "replaced", "retired", "now_required", "not_in_revision", "redefined",
            "needs_newer_app",
        ]

        for wire in definitions {
            let definition = InventoryCatalogueDefinition(wire: wire)
            #expect(definition.wireValue == wire)
            #expect(definition != .unrecognised(wire), "\(wire)")
        }
        for wire in changes {
            let change = InventoryCatalogueChangeKind(wire: wire)
            #expect(change.wireValue == wire)
            #expect(change != .unrecognised(wire), "\(wire)")
        }
        #expect(InventoryCatalogueChangeKind(wire: "now_required") == .nowRequired)
        #expect(InventoryCatalogueDefinition(wire: "option") == .option)
    }

    @Test("a kind this build does not know is kept, spelling and all")
    func unknownKindsAreKept() {
        #expect(InventoryCatalogueDefinition(wire: "shelf") == .unrecognised("shelf"))
        #expect(InventoryCatalogueChangeKind(wire: "merged").wireValue == "merged")
    }

    @Test("Retry is worth offering only once the fields changed since the repair opened")
    func definitionsChanged() {
        func repair(opened: Int?, current: Int?) -> InventoryCatalogueRepair {
            InventoryCatalogueRepair(
                queued: nil, changes: [], openedAtRevision: opened, currentRevision: current)
        }

        #expect(!repair(opened: 3, current: 3).definitionsChanged)
        #expect(repair(opened: 3, current: 4).definitionsChanged)
        #expect(repair(opened: nil, current: 4).definitionsChanged)
        #expect(!repair(opened: nil, current: nil).definitionsChanged)
    }
}
