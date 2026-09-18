import AppCore
import AppCoreFakes
import Foundation
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

    @Test("a place's delete confirmation names what moves, from the replica's own counts")
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

        let effect = tree.deletionEffect(of: "kitchen")

        #expect(effect == "1 container and 1 item move to Home.")
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
}
