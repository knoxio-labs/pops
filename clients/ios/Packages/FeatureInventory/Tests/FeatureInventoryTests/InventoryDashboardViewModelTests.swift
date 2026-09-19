import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory dashboard view model")
internal struct InventoryDashboardViewModelTests {
    private typealias Fixture = InventoryFixture

    private static let home = [
        Fixture.location("kitchen", "Kitchen"),
        Fixture.location("office", "Office 04"),
        Fixture.location("shed", "Shed", deleted: true),
    ]

    @Test("the skeleton shows until the store answers for the first time")
    func skeletonBeforeFirstAnswer() async {
        let model = InventoryDashboardViewModel(store: PendingInventoryStore())
        let (task, dashboard) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        #expect(model.phase == .loading)
        #expect(dashboard == nil)
    }

    @Test("a store that ends without answering is unavailable, not an endless skeleton")
    func endedWithoutAnswerIsUnavailable() async {
        let model = InventoryDashboardViewModel(store: UnboundInventoryStore())
        let (task, _) = await model.startAndAwaitFirstAnswer()
        await task.value

        #expect(model.phase == .unavailable)
    }

    @Test("open containers carry their effective place and their direct item count")
    func mapsOpenContainers() async throws {
        let store = InMemoryInventoryStore(
            items: [
                Fixture.item("kitchen-12", "Kitchen 12", at: .location("kitchen"), access: .open),
                Fixture.item("crate", "Crate", at: .location("office"), access: .closed),
                Fixture.item("inner", "Cutlery box", at: .container("crate"), access: .open),
                Fixture.item("plates", "Plates", at: .container("kitchen-12")),
                Fixture.item("bowls", "Bowls", at: .container("kitchen-12")),
                Fixture.item(
                    "chipped", "Chipped mug", at: .container("kitchen-12"), lifecycle: .discarded),
                Fixture.item("forks", "Forks", at: .container("inner")),
                Fixture.item(
                    "old", "Old box", at: .location("kitchen"), access: .open, lifecycle: .retired),
            ],
            locations: Self.home)
        let model = InventoryDashboardViewModel(store: store)
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        let dashboard = try #require(loaded)

        #expect(dashboard.openContainers.map(\.id) == ["inner", "kitchen-12"])
        #expect(dashboard.openContainers.map(\.place) == ["Office 04", "Kitchen"])
        #expect(dashboard.openContainers.map(\.itemCount) == [1, 2])
        #expect(dashboard.openItemCount == 3)
        #expect(dashboard.counts == InventoryCounts(items: 6, containers: 3, locations: 2))
    }

    @Test("in-hand rows say where each came from, and only a live place can take it back")
    func mapsInHand() async throws {
        let store = InMemoryInventoryStore(
            items: [
                Fixture.item("drawer", "Documents drawer", at: .location("office"), access: .open),
                Fixture.item(
                    "gone-box", "Gone box", at: .location("kitchen"), access: .open, deleted: true),
                Fixture.item("passport", "Passport", at: .hand, previous: .container("drawer")),
                Fixture.item("router", "Wi-Fi router", at: .hand, previous: .location("office")),
                Fixture.item("rake", "Rake", at: .hand, previous: .location("shed")),
                Fixture.item("lamp", "Lamp", at: .hand, previous: .tombstoned),
                Fixture.item("scarf", "Scarf", at: .hand, previous: .container("gone-box")),
                Fixture.item("key", "Key", at: .hand),
            ],
            locations: Self.home)
        let model = InventoryDashboardViewModel(store: store)
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        let rows = Dictionary(
            uniqueKeysWithValues: try #require(loaded).inHand.map { ($0.id, $0.previous) })

        #expect(
            rows["passport"] == .place(name: "Documents drawer", placement: .container("drawer")))
        #expect(rows["router"] == .place(name: "Office 04", placement: .location("office")))
        #expect(rows["rake"] == .deleted)
        #expect(rows["lamp"] == .deleted)
        #expect(rows["scarf"] == .deleted)
        #expect(rows["key"] == .nowhere)
    }

    @Test("recent work is the newest events, named and placed from the same state")
    func mapsRecentWork() async throws {
        let store = InMemoryInventoryStore(
            items: [
                Fixture.item("drill", "Cordless drill", at: .container("tools")),
                Fixture.item("tools", "Garage tools", at: .location("kitchen"), access: .open),
                Fixture.item("linen", "Linen 02", at: .location("office"), access: .closed),
            ],
            locations: Self.home,
            events: [
                Fixture.event(1, .created, on: "drill"),
                Fixture.event(2, .accessChanged, on: "linen", after: ["access": .choice("closed")]),
                Fixture.event(3, .unrecognised("put_back"), on: "drill", undoable: false),
                Fixture.event(4, .locationRenamed, on: "office", entityKind: .location),
            ])
        let model = InventoryDashboardViewModel(store: store)
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        let recent = try #require(loaded).recentWork

        #expect(InventoryDashboardViewModel.recentLimit == 3)
        #expect(recent.map(\.id) == [4, 3, 2])
        #expect(
            recent.map(\.title) == [
                "Office 04 renamed", "Cordless drill put back", "Linen 02 closed",
            ])
        #expect(recent.map(\.place) == [nil, "Garage tools", "Office 04"])
        #expect(recent.map(\.isUndoable) == [true, false, true])
    }

    @Test("an empty replica is the first run")
    func emptyReplicaIsFirstRun() async throws {
        let store = InMemoryInventoryStore()
        store.setReplicaStatus(.empty)
        let model = InventoryDashboardViewModel(store: store)
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        #expect(try #require(loaded).isFirstRun)
    }
}
