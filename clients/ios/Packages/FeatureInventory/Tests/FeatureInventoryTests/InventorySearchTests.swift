import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory search")
internal struct InventorySearchTests {
    private typealias Fixture = InventoryListFixture

    private static func store() -> InMemoryInventoryStore {
        InMemoryInventoryStore(
            items: [
                Fixture.item("hose", "Garden hose", at: .location("garage"), code: "G12"),
                Fixture.item(
                    "chair", "Garden chair", at: .location("garage"), lifecycle: .discarded),
                Fixture.item("rake", "Rake for the garden", at: .location("garage")),
                Fixture.item("gone", "Garden gnome", deleted: true),
            ],
            locations: [
                Fixture.location("home", "Home"),
                Fixture.location("garage", "Garage", parent: "home"),
                Fixture.location("shed", "Old garden shed", parent: "home", deleted: true),
            ],
            catalogue: Fixture.catalogue)
    }

    private static func loaded(_ model: InventorySearchViewModel) async -> Task<Void, Never> {
        let task = Task { await model.observe() }
        _ = await eventually { model.results != nil }
        return task
    }

    @Test("results leave out inactive items until Include inactive is on, then show them")
    func includeInactiveThroughTheStore() async {
        let model = InventorySearchViewModel(store: Self.store())
        model.query = "gar"
        let first = await Self.loaded(model)
        defer { first.cancel() }

        #expect(model.hitRecords.map(\.id).sorted() == ["hose", "rake"])

        model.filter.includesInactive = true
        let second = await Self.loaded(model)
        defer { second.cancel() }
        _ = await eventually { model.hitRecords.count == 3 }

        #expect(model.hitRecords.map(\.id).sorted() == ["chair", "hose", "rake"])
    }

    @Test("one ranked list: names starting with the query, then containing it, places included")
    func rankedWithPlaces() async {
        let model = InventorySearchViewModel(store: Self.store())
        model.query = "gar"
        let task = await Self.loaded(model)
        defer { task.cancel() }

        #expect(model.hits.map(\.name) == ["Garden hose", "Garage", "Rake for the garden"])
    }

    @Test("an active filter takes places out of the list, Include inactive alone does not")
    func filterHidesPlaces() async {
        let model = InventorySearchViewModel(store: Self.store())
        model.query = "gar"
        model.filter.includesInactive = true
        let task = await Self.loaded(model)
        defer { task.cancel() }
        #expect(model.hits.contains { $0.recordID == nil })

        model.filter.missing = .code

        #expect(!model.hits.contains { $0.recordID == nil })
        #expect(model.hitRecords.map(\.id).sorted() == ["chair", "rake"])
    }

    @Test("an empty query matches nothing, so the empty search shows recents")
    func emptyQuery() async {
        let model = InventorySearchViewModel(store: Self.store())
        model.query = "   "
        let task = await Self.loaded(model)
        defer { task.cancel() }

        #expect(model.results?.records.isEmpty == true)
        #expect(model.hits.isEmpty)
    }

    @Test("an empty replica is the first launch, and Download takes it to current")
    func firstLaunch() async {
        let store = Self.store()
        store.setReplicaStatus(.empty)
        let model = InventorySearchViewModel(store: store)
        let task = await Self.loaded(model)
        defer { task.cancel() }
        #expect(model.results?.isFirstRun == true)

        await model.download()

        #expect(await eventually { model.results?.isFirstRun == false })
    }
}

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
