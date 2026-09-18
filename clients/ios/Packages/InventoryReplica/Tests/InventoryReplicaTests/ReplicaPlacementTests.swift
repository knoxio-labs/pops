import AppCore
import Foundation
import InventoryReplica
import Testing

@Suite("Placement walk and contents")
internal struct ReplicaPlacementTests {
    @Test("moving a container moves its contents without changing their revisions")
    func movedContainerCarriesContents() throws {
        let replica = try Fixture.downloaded(
            items: [
                Fixture.box("box", revision: 1, placement: .location("office")),
                Fixture.item("lamp", revision: 5, placement: .container("box")),
            ],
            locations: [Fixture.location("office"), Fixture.location("truck")])
        #expect(try replica.ids(.contents(ofLocation: "office")) == ["box", "lamp"])

        try replica.apply(
            Fixture.changes(items: [Fixture.box("box", revision: 2, placement: .location("truck"))])
        )

        #expect(try replica.read(.contents(ofLocation: "office")).isEmpty)
        #expect(try replica.ids(.contents(ofLocation: "truck")) == ["box", "lamp"])
        let lamp = try #require(try replica.read(.item(id: "lamp")))
        #expect(lamp.revision == 5)
        #expect(lamp.placement == .container("box"))
        #expect(
            try replica.placementTrail(ofItem: "lamp")
                == .contained(location: "truck", containers: ["box"]))
    }

    @Test("a nested chain lists its containers outermost first")
    func nestedChainIsOutermostFirst() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.box("crate", placement: .location("garage")),
            Fixture.box("tin", placement: .container("crate")),
            Fixture.item("screw", placement: .container("tin")),
        ])

        let trail = try #require(try replica.placementTrail(ofItem: "screw"))
        #expect(trail == .contained(location: "garage", containers: ["crate", "tin"]))
        #expect(trail.effectiveLocation == "garage")
        #expect(trail.containingItem == "tin")
        #expect(try replica.ids(.contents(ofLocation: "garage")) == ["crate", "screw", "tin"])
    }

    @Test("a chain whose outermost container is in hand has no effective location")
    func chainEndingInHand() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.box("bag", placement: .hand),
            Fixture.item("keys", placement: .container("bag")),
        ])

        #expect(
            try replica.placementTrail(ofItem: "keys")
                == .contained(location: nil, containers: ["bag"]))
        #expect(try replica.placementTrail(ofItem: "bag") == .inHand(previous: nil))
    }

    @Test("a containment cycle ends the walk instead of looping")
    func cycleEndsWalk() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.box("left", placement: .container("right")),
            Fixture.box("right", placement: .container("left")),
        ])

        #expect(
            try replica.placementTrail(ofItem: "left")
                == .contained(location: nil, containers: ["left", "right"]))
        #expect(try replica.read(.contents(ofLocation: "anywhere")).isEmpty)
    }

    @Test("a direct placement and an unknown item")
    func directAndUnknown() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("chair", placement: .location("den"))
        ])

        #expect(try replica.placementTrail(ofItem: "chair") == .direct(location: "den"))
        #expect(try replica.placementTrail(ofItem: "nothing") == nil)
    }

    @Test("contents leave out inactive items but walk through an inactive container")
    func contentsSkipInactiveItems() throws {
        let retiredBox = InventoryItem(
            id: "box", revision: 1, seq: 1, name: "box", typeKey: nil, lifecycle: .retired,
            placement: .location("den"),
            containment: InventoryContainment(access: .closed, isFull: false),
            createdAt: Fixture.created, updatedAt: Fixture.created)
        let lostThing = InventoryItem(
            id: "lost", revision: 1, seq: 1, name: "lost", typeKey: nil, lifecycle: .lost,
            placement: .location("den"), createdAt: Fixture.created, updatedAt: Fixture.created)
        let replica = try Fixture.downloaded(items: [
            retiredBox, lostThing, Fixture.item("inside", placement: .container("box")),
        ])

        #expect(try replica.ids(.contents(ofLocation: "den")) == ["inside"])
    }

    @Test("in hand remembers where each item came from, and says when that place is gone")
    func inHandPreviousPlacement() throws {
        let fromOffice = InventoryItem(
            id: "stapler", revision: 1, seq: 1, name: "Stapler", typeKey: nil, placement: .hand,
            previousPlacement: .location("office"), createdAt: Fixture.created,
            updatedAt: Fixture.created)
        let fromBox = InventoryItem(
            id: "tape", revision: 1, seq: 1, name: "Tape", typeKey: nil, placement: .hand,
            previousPlacement: .container("box"), createdAt: Fixture.created,
            updatedAt: Fixture.created)
        let replica = try Fixture.downloaded(
            items: [fromOffice, fromBox, Fixture.box("box", placement: .location("office"))],
            locations: [Fixture.location("office")])

        #expect(
            try replica.read(.inHand).map(\.previousPlacement) == [
                .location("office"), .container("box"),
            ])

        try replica.apply(
            Fixture.changes(locations: [
                Fixture.location("office", revision: 2, deletedAt: Fixture.created)
            ]))

        #expect(
            try replica.read(.inHand).map(\.previousPlacement) == [.tombstoned, .container("box")])
    }

    @Test("open containers are active containers whose access is open")
    func openContainers() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.box("open", placement: .hand),
            Fixture.box("shut", placement: .hand, access: .closed),
            Fixture.item("plain"),
        ])

        #expect(try replica.ids(.openContainers) == ["open"])
    }

    @Test("recents are newest first and honour the limit")
    func recents() throws {
        let replica = try Fixture.downloaded(items: [
            Fixture.item("old", revision: 1), Fixture.item("new", revision: 3),
            Fixture.item("mid", revision: 2),
        ])

        #expect(try replica.ids(.recents(limit: 2)) == ["new", "mid"])
        #expect(try replica.read(.recents(limit: 0)).isEmpty)
    }
}
