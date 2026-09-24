import Testing

@testable import FeatureInventory

@Suite("Inventory search ranking")
internal struct InventorySearchRankingTests {
    private typealias Fixture = InventoryListFixture

    @Test("ties keep their arrival order, records before places")
    func stableTies() {
        let hits = InventorySearchRanking.rank(
            "box",
            records: [Fixture.record("Box B"), Fixture.record("Big box"), Fixture.record("Box A")],
            places: [InventorySearchPlace(id: "p", name: "Box room", parents: [])])

        #expect(hits.map(\.name) == ["Box B", "Box A", "Box room", "Big box"])
    }

    @Test("a match on another field ranks below every name match")
    func otherFieldLast() {
        let hits = InventorySearchRanking.rank(
            "b41",
            records: [Fixture.record("Drill", code: "B412"), Fixture.record("b41 spare")],
            places: [])

        #expect(hits.map(\.name) == ["b41 spare", "Drill"])
    }

    @Test("the code badge shows only when the query is in the code")
    func matchedCode() {
        let record = Fixture.record("Drill", code: "B412")

        #expect(InventorySearchRanking.matchedCode("b41", in: record))
        #expect(!InventorySearchRanking.matchedCode("drill", in: record))
        #expect(!InventorySearchRanking.matchedCode(" ", in: record))
        #expect(!InventorySearchRanking.matchedCode("b41", in: Fixture.record("b41")))
    }

    @Test("highlights find every occurrence, case-insensitively, and none for a blank query")
    func highlights() {
        let name = "Garden hose for the garden"

        let ranges = InventorySearchRanking.highlights(of: "GARDEN", in: name)

        #expect(ranges.map { String(name[$0]) } == ["Garden", "garden"])
        #expect(InventorySearchRanking.highlights(of: "  ", in: name).isEmpty)
    }

    @Test("places match by name in tree order with their parents, and never a deleted one")
    func places() {
        let tree = [
            Fixture.location("kitchen", "Kitchen", parent: "home", order: 1),
            Fixture.location("home", "Home"),
            Fixture.location("office", "Office", parent: "home", order: 0),
            Fixture.location("drawer", "Kitchen drawer", parent: "kitchen"),
            Fixture.location("old", "Old kitchen", deleted: true),
            Fixture.location("orphan", "Kitchen annex", parent: "old"),
        ]

        let places = InventorySearchPlace.matching("kitchen", in: tree)

        #expect(places.map(\.name) == ["Kitchen", "Kitchen drawer"])
        #expect(places.map(\.parents) == [["Home"], ["Home", "Kitchen"]])
        #expect(InventorySearchPlace.matching("", in: tree).isEmpty)
    }
}
