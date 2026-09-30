import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Locations, the placement picker and Store here")
internal struct InventoryLocationTests {
    private typealias Fixture = InventoryFixture

    private static func location(_ id: String, _ name: String, parentId: String? = nil)
        -> InventoryLocation
    {
        InventoryLocation(
            id: id, revision: 1, seq: 1, name: name, parentId: parentId, sortOrder: 0)
    }

    @Test("Store here issues item.move with the store verb, for the chosen target")
    func storeHereIssuesStoreVerb() async throws {
        let base = InMemoryInventoryStore(
            items: [Fixture.item("kettle", "Kettle", at: .hand)],
            locations: [Self.location("kitchen", "Kitchen")])
        let recording = RecordingInventoryStore(base)
        let runner = InventoryCommandRunner(store: recording)
        let model = InventoryStoreHereModel(
            target: .location(id: "kitchen", name: "Kitchen"), runner: runner,
            selected: ["kettle"])

        let landed = await model.store()

        #expect(landed)
        #expect(
            recording.commands == [
                .moveItem(id: "kettle", to: .location("kitchen"), verb: .store)
            ])
    }

    @Test("Store here pages eligible items and ignores concurrent duplicate loads")
    func storeHerePages() async {
        let items =
            (0..<45).map { index in
                Fixture.item("candidate-\(index)", "Candidate \(index)", at: .hand)
            } + [Fixture.item("target-item", "Already here", at: .location("garage"))]
        let base = InMemoryInventoryStore(items: items)
        let model = InventoryStoreHereModel(
            target: .location(id: "garage", name: "Garage"),
            runner: InventoryCommandRunner(store: base))
        let task = Task { await model.observe() }
        defer { task.cancel() }

        #expect(await eventually { model.shownCandidates.count == 40 && model.canLoadMore })
        async let firstLoad: Void = model.loadNextPage()
        async let duplicateLoad: Void = model.loadNextPage()
        await firstLoad
        await duplicateLoad

        #expect(model.shownCandidates.count == 45)
        #expect(Set(model.shownCandidates.map(\.id)).count == 45)
        #expect(!model.shownCandidates.contains { $0.id == "target-item" })
        #expect(!model.canLoadMore)
    }

    @Test("a place's delete confirmation says its things become unlocated, from the replica")
    func deletionEffectReadsReplicaCounts() async throws {
        let base = InMemoryInventoryStore(
            items: [
                Fixture.item("lamp", "Lamp", at: .location("kitchen")),
                Fixture.item("box", "Box", at: .location("kitchen"), access: .open),
            ],
            locations: [
                Self.location("home", "Home"),
                Self.location("kitchen", "Kitchen", parentId: "home"),
            ])
        var iterator = base.observe(InventoryQuery { InventoryLocationTree(reading: $0) })
            .makeAsyncIterator()
        let tree = try #require(await iterator.next())

        let effect = tree.deletion(of: "kitchen")?.confirmation

        #expect(effect == "1 container and 1 item become unlocated.")
        #expect(tree.deletion(of: "attic") == nil)
    }

    @Test("location rows retain the first photo for direct and contained items")
    func locationRowsRetainPhotoReferences() async throws {
        let base = InMemoryInventoryStore(
            items: [
                Fixture.item(
                    "lamp", "Lamp", at: .location("kitchen"), photo: "lamp-photo"),
                Fixture.item(
                    "box", "Box", at: .location("kitchen"), access: .open, photo: "box-photo"),
                Fixture.item(
                    "mug", "Mug", at: .container("box"), photo: "mug-photo"),
            ],
            locations: [Self.location("kitchen", "Kitchen")])
        var iterator = base.observe(InventoryQuery { InventoryLocationTree(reading: $0) })
            .makeAsyncIterator()
        let tree = try #require(await iterator.next())
        let kitchen = try #require(tree.node("kitchen"))
        let box = try #require(kitchen.containers.first)

        #expect(kitchen.items.map(\.photo) == ["lamp-photo"])
        #expect(box.photo == "box-photo")
        #expect(box.contents.map(\.photo) == ["mug-photo"])
    }

    @Test("reparent targets exclude the place itself and everything under it")
    func reparentTargetsExcludeDescendants() async throws {
        let base = InMemoryInventoryStore(
            locations: [
                Self.location("home", "Home"),
                Self.location("garage", "Garage", parentId: "home"),
                Self.location("shelf", "Shelf", parentId: "garage"),
                Self.location("bedroom", "Bedroom", parentId: "home"),
            ])
        var iterator = base.observe(InventoryQuery { InventoryLocationTree(reading: $0) })
            .makeAsyncIterator()
        let tree = try #require(await iterator.next())

        let targets = tree.reparentTargets(for: "garage")

        #expect(targets == ["home", "bedroom"])
    }

    @Test("Put back is offered from a closed container, not only an open one")
    func putBackOffersAClosedContainer() async throws {
        let base = InMemoryInventoryStore(items: [
            Fixture.item("crate", "Crate", at: .location("garage"), access: .closed),
            Fixture.item(
                "spanner", "Spanner", at: .hand, previous: .container("crate")),
        ])
        var iterator = base.observe(
            InventoryQuery { InventoryPlacementChoices(reading: $0, for: .items(["spanner"])) }
        ).makeAsyncIterator()
        let choices = try #require(await iterator.next())

        let putBack = try #require(choices.putBack)

        #expect(putBack.kind == .putBack(.container("crate")))
    }

    @Test("the destination tree puts places and nested containers in one hierarchy")
    func destinationTreeIncludesContainers() async throws {
        let base = InMemoryInventoryStore(
            items: [
                Fixture.item("lamp", "Lamp", at: .hand),
                Fixture.item("box", "Box", at: .location("home"), access: .open),
                Fixture.item("tray", "Tray", at: .container("box"), access: .open),
                Fixture.item("crate", "Crate", at: .location("home"), access: .closed),
            ],
            locations: [
                Self.location("home", "Home"),
                Self.location("bedroom", "Bedroom", parentId: "home"),
            ])
        var iterator = base.observe(
            InventoryQuery {
                InventoryPlacementChoices(reading: $0, for: .items(["lamp"]))
            }
        ).makeAsyncIterator()
        let choices = try #require(await iterator.next())

        #expect(
            choices.destinations.children(of: "home").map { $0.destination.name }
                == ["Bedroom", "Box", "Crate"])
        #expect(
            choices.destinations.children(of: "box").map { $0.destination.name } == ["Tray"])
        #expect(choices.destinations.matching("tray").map { $0.destination.name } == ["Tray"])
        #expect(choices.destinations.node("crate")?.destination.kind == .closedContainer)
        #expect(choices.destinations.drillID(for: "home", at: "home") == nil)
        #expect(choices.destinations.drillID(for: "box", at: "home") == "box")
    }
}
